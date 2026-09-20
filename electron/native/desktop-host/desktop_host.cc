#include <windows.h>

#include <cstdint>
#include <cstring>
#include <string>
#include <unordered_map>

#include <napi.h>

namespace {

constexpr UINT kSpawnWorkerMessage = 0x052C;

struct DesktopLayer {
  HWND progman = nullptr;
  HWND shellDefView = nullptr;
  HWND classicParent = nullptr;
  HWND workerW = nullptr;
  DWORD explorerPid = 0;
  bool raised = false;
};

struct DiscoveryContext {
  HWND preferredParent = nullptr;
  bool raised = false;
  HWND shellDefView = nullptr;
  HWND shellParent = nullptr;
  HWND classicWorker = nullptr;
};

struct Attachment {
  HWND parent = nullptr;
  HWND insertAfter = nullptr;
  RECT rect{};
  bool raised = false;
  bool interactive = false;
};

std::unordered_map<uintptr_t, Attachment> attachments;

bool IsValid(HWND hwnd) {
  return hwnd != nullptr && IsWindow(hwnd) != FALSE;
}

HWND FindWorkerAfter(HWND top) {
  if (!IsValid(top)) return nullptr;
  return FindWindowExW(nullptr, top, L"WorkerW", nullptr);
}

HWND FindWorkerUnder(HWND parent) {
  if (!IsValid(parent)) return nullptr;
  return FindWindowExW(parent, nullptr, L"WorkerW", nullptr);
}

bool ReadHwnd(const Napi::Value& value, HWND* result) {
  if (!value.IsBuffer()) return false;

  auto buffer = value.As<Napi::Buffer<uint8_t>>();
  if (buffer.Length() < sizeof(void*)) return false;

  uintptr_t raw = 0;
  std::memcpy(&raw, buffer.Data(), sizeof(void*));
  *result = reinterpret_cast<HWND>(raw);
  return IsValid(*result);
}

bool ReadRect(const Napi::Value& value, RECT* result) {
  if (!value.IsObject()) return false;

  auto object = value.As<Napi::Object>();
  result->left = object.Get("x").ToNumber().Int32Value();
  result->top = object.Get("y").ToNumber().Int32Value();
  result->right = result->left + object.Get("width").ToNumber().Int32Value();
  result->bottom = result->top + object.Get("height").ToNumber().Int32Value();
  return result->right > result->left && result->bottom > result->top;
}

Napi::BigInt HandleValue(Napi::Env env, HWND hwnd) {
  return Napi::BigInt::New(
      env, static_cast<uint64_t>(reinterpret_cast<uintptr_t>(hwnd)));
}

Napi::Object LayerValue(Napi::Env env, const DesktopLayer& layer) {
  auto result = Napi::Object::New(env);
  result.Set("mode", layer.raised ? "raised" : "classic");
  result.Set("progman", HandleValue(env, layer.progman));
  result.Set("shellDefView", HandleValue(env, layer.shellDefView));
  result.Set("workerW", HandleValue(env, layer.workerW));
  result.Set("explorerPid", Napi::Number::New(env, layer.explorerPid));
  return result;
}

BOOL CALLBACK FindShellView(HWND top, LPARAM rawContext) {
  auto* context = reinterpret_cast<DiscoveryContext*>(rawContext);
  HWND shellView = FindWindowExW(top, nullptr, L"SHELLDLL_DefView", nullptr);
  if (!IsValid(shellView)) return TRUE;

  // On the raised Windows 11 desktop, Progman owns the DefView that must
  // remain above the wallpaper. Prefer that exact view over another stale or
  // auxiliary shell view returned by EnumWindows.
  if (context->raised && top == context->preferredParent) {
    context->shellDefView = shellView;
    context->shellParent = top;
    context->classicWorker = FindWindowExW(nullptr, top, L"WorkerW", nullptr);
    return FALSE;
  }

  // For the classic layout the first valid shell view is the one Explorer
  // exposes for desktop icons. Do not overwrite it with another shell view.
  if (!IsValid(context->shellDefView)) {
    context->shellDefView = shellView;
    context->shellParent = top;
    context->classicWorker = FindWindowExW(nullptr, top, L"WorkerW", nullptr);
  }
  return TRUE;
}

bool DiscoverDesktop(DesktopLayer* layer) {
  *layer = DesktopLayer{};
  layer->progman = FindWindowW(L"Progman", nullptr);
  if (!IsValid(layer->progman)) return false;

  auto extendedStyle = GetWindowLongPtrW(layer->progman, GWL_EXSTYLE);
  layer->raised =
      (extendedStyle & static_cast<LONG_PTR>(WS_EX_NOREDIRECTIONBITMAP)) != 0;

  DWORD_PTR result = 0;
  SendMessageTimeoutW(
      layer->progman,
      kSpawnWorkerMessage,
      static_cast<WPARAM>(0xD),
      static_cast<LPARAM>(1),
      SMTO_NORMAL | SMTO_ABORTIFHUNG,
      1000,
      &result);

  DiscoveryContext context;
  context.preferredParent = layer->progman;
  context.raised = layer->raised;
  EnumWindows(FindShellView, reinterpret_cast<LPARAM>(&context));
  layer->shellDefView = context.shellDefView;

  if (!IsValid(layer->shellDefView)) {
    return false;
  }

  layer->workerW = layer->raised ? FindWorkerUnder(layer->progman)
                                 : context.classicWorker;

  // Some Explorer builds report the raised flag before the child WorkerW is
  // available. The classic sibling is still a valid fallback in that case.
  if (!IsValid(layer->workerW)) {
    layer->workerW = context.classicWorker;
  }

  // Explorer can create the WorkerW after the first enumeration. Retry the
  // two known locations once after the shell message has completed instead of
  // failing with the old one-shot WorkerW assumption.
  if (!IsValid(layer->workerW)) {
    layer->workerW = layer->raised ? FindWorkerUnder(layer->progman)
                                   : FindWorkerAfter(context.shellParent);
  }

  if (!IsValid(layer->workerW)) return false;

  GetWindowThreadProcessId(layer->progman, &layer->explorerPid);
  return true;
}

bool IsBelow(HWND candidate, HWND reference) {
  if (!IsValid(candidate) || !IsValid(reference)) return false;
  if (GetParent(candidate) != GetParent(reference)) return false;

  for (HWND current = GetWindow(reference, GW_HWNDNEXT); IsValid(current);
       current = GetWindow(current, GW_HWNDNEXT)) {
    if (current == candidate) return true;
  }

  return false;
}

bool IsAbove(HWND candidate, HWND reference) {
  if (!IsValid(candidate) || !IsValid(reference)) return false;
  if (GetParent(candidate) != GetParent(reference)) return false;

  for (HWND current = GetWindow(reference, GW_HWNDPREV); IsValid(current);
       current = GetWindow(current, GW_HWNDPREV)) {
    if (current == candidate) return true;
  }

  return false;
}

bool EnsureRaisedZOrder(
    HWND hwnd,
    const DesktopLayer& layer,
    const RECT& rect) {
  if (!IsValid(hwnd) || !IsValid(layer.progman) ||
      !IsValid(layer.shellDefView) || !IsValid(layer.workerW) ||
      GetParent(hwnd) != layer.progman ||
      GetParent(layer.shellDefView) != layer.progman ||
      GetParent(layer.workerW) != layer.progman) {
    return false;
  }

  const int width = rect.right - rect.left;
  const int height = rect.bottom - rect.top;

  // The raised desktop contract is:
  //   SHELLDLL_DefView/icons
  //   Electron wallpaper
  //   WorkerW/Windows wallpaper
  // Passing SHELLDLL_DefView as hWndInsertAfter places our child directly
  // beneath the icon surface, while the second call keeps WorkerW beneath it.
  if (!SetWindowPos(
          hwnd,
          layer.shellDefView,
          0,
          0,
          width,
          height,
          SWP_NOACTIVATE | SWP_SHOWWINDOW)) {
    return false;
  }

  if (!SetWindowPos(
          layer.workerW,
          hwnd,
          0,
          0,
          0,
          0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)) {
    return false;
  }

  return IsBelow(hwnd, layer.shellDefView) &&
         IsBelow(layer.workerW, hwnd);
}

bool EnsureInteractiveZOrder(
    HWND hwnd,
    const DesktopLayer& layer,
    const RECT& rect) {
  if (!IsValid(hwnd) || !IsValid(layer.progman) ||
      !IsValid(layer.shellDefView) || GetParent(hwnd) != layer.progman) {
    return false;
  }

  const int width = rect.right - rect.left;
  const int height = rect.bottom - rect.top;

  // Interactive wallpaper intentionally sits above the icon surface, but it
  // is still a normal desktop child of Progman, so ordinary application
  // windows remain above it. This is deliberately separate from the
  // non-interactive wallpaper contract.
  if (!SetWindowPos(
          hwnd,
          HWND_TOP,
          0,
          0,
          width,
          height,
          SWP_NOACTIVATE | SWP_SHOWWINDOW)) {
    return false;
  }

  return !layer.raised || IsAbove(hwnd, layer.shellDefView);
}

bool ConfigureWindow(
    HWND hwnd,
    const DesktopLayer& layer,
    const RECT& rect,
    bool interactive,
    Attachment* attachment) {
  if (!IsValid(hwnd) || !IsValid(layer.progman) ||
      !IsValid(layer.workerW) || !IsValid(layer.shellDefView)) {
    return false;
  }

  LONG_PTR style = GetWindowLongPtrW(hwnd, GWL_STYLE);
  style &= ~static_cast<LONG_PTR>(WS_POPUP | WS_CAPTION | WS_THICKFRAME |
                                  WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU);
  style |= WS_CHILD;
  SetWindowLongPtrW(hwnd, GWL_STYLE, style);

  LONG_PTR extendedStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
  extendedStyle &= ~static_cast<LONG_PTR>(WS_EX_APPWINDOW | WS_EX_NOACTIVATE);
  extendedStyle |= WS_EX_TOOLWINDOW;
  if (!interactive) extendedStyle |= WS_EX_NOACTIVATE;
  if (layer.raised) extendedStyle |= WS_EX_LAYERED;
  SetWindowLongPtrW(hwnd, GWL_EXSTYLE, extendedStyle);

  HWND parent = interactive || layer.raised ? layer.progman : layer.workerW;
  HWND insertAfter = interactive ? HWND_TOP
                                 : layer.raised ? layer.shellDefView : nullptr;
  if (!IsValid(parent)) return false;

  SetLastError(ERROR_SUCCESS);
  SetParent(hwnd, parent);
  if (GetLastError() != ERROR_SUCCESS && GetParent(hwnd) != parent) {
    return false;
  }
  if (GetParent(hwnd) != parent) return false;

  if (layer.raised &&
      !SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)) {
    return false;
  }

  SetWindowPos(
      hwnd,
      nullptr,
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE |
          SWP_FRAMECHANGED);

  if (interactive) {
    if (!EnsureInteractiveZOrder(hwnd, layer, rect)) return false;
  } else if (layer.raised) {
    if (!EnsureRaisedZOrder(hwnd, layer, rect)) return false;
  } else {
    int width = rect.right - rect.left;
    int height = rect.bottom - rect.top;
    if (!SetWindowPos(
            hwnd,
            insertAfter,
            0,
            0,
            width,
            height,
            SWP_NOACTIVATE | SWP_SHOWWINDOW)) {
      return false;
    }
  }

  ShowWindow(hwnd, SW_SHOWNOACTIVATE);
  attachment->parent = parent;
  attachment->insertAfter = insertAfter;
  attachment->rect = rect;
  attachment->raised = layer.raised;
  attachment->interactive = interactive;
  return true;
}

Napi::Value Discover(const Napi::CallbackInfo& info) {
  DesktopLayer layer;
  if (!DiscoverDesktop(&layer)) return info.Env().Null();
  return LayerValue(info.Env(), layer);
}

Napi::Value Attach(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "attach(hwnd, rect, interactive?) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  HWND hwnd = nullptr;
  RECT rect{};
  if (!ReadHwnd(info[0], &hwnd) || !ReadRect(info[1], &rect)) {
    Napi::TypeError::New(env, "Invalid HWND buffer or rectangle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  bool interactive = false;
  if (info.Length() >= 3) {
    if (!info[2].IsBoolean()) {
      Napi::TypeError::New(
          env,
          "attach(hwnd, rect, interactive?) expects a boolean interaction flag")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
    interactive = info[2].As<Napi::Boolean>().Value();
  }

  DesktopLayer layer;
  if (!DiscoverDesktop(&layer)) {
    Napi::Error::New(env, "Could not discover the Windows desktop host").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Attachment attachment;
  if (!ConfigureWindow(hwnd, layer, rect, interactive, &attachment)) {
    Napi::Error::New(env, "Could not attach the Electron window to the desktop host").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  attachments[reinterpret_cast<uintptr_t>(hwnd)] = attachment;
  auto result = LayerValue(env, layer);
  result.Set("attached", true);
  return result;
}

Napi::Value Reposition(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 2) {
    Napi::TypeError::New(env, "reposition(hwnd, rect) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  HWND hwnd = nullptr;
  RECT rect{};
  if (!ReadHwnd(info[0], &hwnd) || !ReadRect(info[1], &rect)) {
    Napi::TypeError::New(env, "Invalid HWND buffer or rectangle").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto it = attachments.find(reinterpret_cast<uintptr_t>(hwnd));
  if (it == attachments.end() || GetParent(hwnd) != it->second.parent) {
    Napi::Error::New(env, "Wallpaper HWND is no longer attached").ThrowAsJavaScriptException();
    return env.Undefined();
  }

    if (it->second.interactive) {
      DesktopLayer layer;
      if (!DiscoverDesktop(&layer) ||
          !EnsureInteractiveZOrder(hwnd, layer, rect)) {
        Napi::Error::New(env, "Could not restore interactive wallpaper order").ThrowAsJavaScriptException();
        return env.Undefined();
      }
      it->second.parent = layer.progman;
      it->second.insertAfter = HWND_TOP;
    } else if (it->second.raised) {
    DesktopLayer layer;
    if (!DiscoverDesktop(&layer) ||
        !EnsureRaisedZOrder(hwnd, layer, rect)) {
      Napi::Error::New(env, "Could not restore raised desktop wallpaper order").ThrowAsJavaScriptException();
      return env.Undefined();
    }
    it->second.parent = layer.progman;
    it->second.insertAfter = layer.shellDefView;
  } else if (!SetWindowPos(
                 hwnd,
                 it->second.insertAfter,
                 0,
                 0,
                 rect.right - rect.left,
                 rect.bottom - rect.top,
                 SWP_NOACTIVATE | SWP_SHOWWINDOW)) {
    Napi::Error::New(env, "Could not reposition wallpaper HWND").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  it->second.rect = rect;
  return env.Undefined();
}

Napi::Value Validate(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "validate(hwnd) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  HWND hwnd = nullptr;
  if (!ReadHwnd(info[0], &hwnd)) {
    Napi::TypeError::New(env, "Invalid HWND buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto it = attachments.find(reinterpret_cast<uintptr_t>(hwnd));
  bool attached = it != attachments.end() &&
                  IsValid(it->second.parent) &&
                  GetParent(hwnd) == it->second.parent;
  bool zOrderValid = true;

  if (attached && (it->second.raised || it->second.interactive)) {
    DesktopLayer layer;
    if (!DiscoverDesktop(&layer)) {
      attached = false;
    } else {
      attached = GetParent(hwnd) == layer.progman;
      if (it->second.interactive) {
        zOrderValid = attached &&
                      (!layer.raised || IsAbove(hwnd, layer.shellDefView));
      } else {
        zOrderValid = attached &&
                      IsBelow(hwnd, layer.shellDefView) &&
                      IsBelow(layer.workerW, hwnd);
      }
    }
  }

  auto result = Napi::Object::New(env);
  result.Set("attached", attached);
  result.Set("parentValid", attached && IsValid(it->second.parent));
  result.Set("zOrderValid", zOrderValid);
  return result;
}

Napi::Value Detach(const Napi::CallbackInfo& info) {
  auto env = info.Env();
  if (info.Length() < 1) {
    Napi::TypeError::New(env, "detach(hwnd) is required").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  HWND hwnd = nullptr;
  if (!ReadHwnd(info[0], &hwnd)) {
    Napi::TypeError::New(env, "Invalid HWND buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  SetParent(hwnd, nullptr);
  attachments.erase(reinterpret_cast<uintptr_t>(hwnd));
  return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("discover", Napi::Function::New(env, Discover));
  exports.Set("attach", Napi::Function::New(env, Attach));
  exports.Set("reposition", Napi::Function::New(env, Reposition));
  exports.Set("validate", Napi::Function::New(env, Validate));
  exports.Set("detach", Napi::Function::New(env, Detach));
  return exports;
}

}  // namespace

NODE_API_MODULE(desktop_host, Init)
