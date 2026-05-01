export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel: () => void;
  flush: () => void;
}

export const createDebouncedFunction = <TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  delayMs: number,
): DebouncedFunction<TArgs> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: TArgs | null = null;

  const debounced = ((...args: TArgs) => {
    lastArgs = args;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (delayMs <= 0) {
      callback(...args);
      lastArgs = null;
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) {
        callback(...lastArgs);
        lastArgs = null;
      }
    }, delayMs);
  }) as DebouncedFunction<TArgs>;

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs) {
      callback(...lastArgs);
      lastArgs = null;
    }
  };

  return debounced;
};
