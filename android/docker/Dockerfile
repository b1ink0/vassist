FROM ubuntu:24.04
# vassist-sherpa-builder: all dependencies pre-baked so rebuilds never
# re-download NDK/SDK/Java/toolchains. Build once:
#   docker build -t vassist-sherpa-builder android/docker/
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y build-essential cmake ninja-build git python3 python3-pip \
        curl unzip zip wget ccache pkg-config openjdk-17-jdk-headless && \
    rm -rf /var/lib/apt/lists/* && \
    python3 -m pip install --break-system-packages packaging numpy protobuf flatbuffers setuptools wheel

# Android NDK (Linux)
RUN cd /opt && \
    curl -sSL -o ndk.zip https://dl.google.com/android/repository/android-ndk-r26d-linux.zip && \
    unzip -q ndk.zip && rm ndk.zip
ENV ANDROID_NDK=/opt/android-ndk-r26d
ENV PATH="$ANDROID_NDK/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH"

# Minimal Android SDK for ORT NNAPI build checks
RUN mkdir -p /opt/android-sdk/cmdline-tools && \
    curl -sSL -o /tmp/ct.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip && \
    unzip -q /tmp/ct.zip -d /opt/android-sdk/cmdline-tools && \
    mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest && \
    rm /tmp/ct.zip && \
    yes | /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/opt/android-sdk --licenses > /dev/null; \
    /opt/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root=/opt/android-sdk \
        "platforms;android-27" "build-tools;34.0.0" > /dev/null
ENV ANDROID_SDK_HOME=/opt/android-sdk

WORKDIR /work
CMD ["bash"]
