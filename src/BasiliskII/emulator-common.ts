export const InputBufferAddresses = {
    globalLockAddr: 0,
    mouseMoveFlagAddr: 1,
    mouseMoveXDeltaAddr: 2,
    mouseMoveYDeltaAddr: 3,
    mouseButtonStateAddr: 4,
    keyEventFlagAddr: 5,
    keyCodeAddr: 6,
    keyStateAddr: 7,
    stopFlagAddr: 8,
};

export type EmulatorMouseEvent =
    | {type: "mousemove"; dx: number; dy: number}
    | {type: "mousedown"}
    | {type: "mouseup"};
export type EmulatorTouchEvent = {type: "touchstart"; dx: number; dy: number};
export type EmulatorKeyboardEvent = {
    type: "keydown" | "keyup";
    keyCode: number;
};
export type EmulatorStopEvent = {
    type: "stop";
};

export type EmulatorStartEvent = {
    type: "start";
};

export type EmulatorInputEvent =
    | EmulatorMouseEvent
    | EmulatorTouchEvent
    | EmulatorKeyboardEvent
    | EmulatorStopEvent
    | EmulatorStartEvent;

export enum LockStates {
    READY_FOR_UI_THREAD,
    UI_THREAD_LOCK,
    READY_FOR_EMUL_THREAD,
    EMUL_THREAD_LOCK,
}

export type EmulatorChunkedFileSpec = {
    name: string;
    baseUrl: string;
    totalSize: number;
    chunks: string[];
    chunkSize: number;
    prefetchChunks: number[];
};

export function generateChunkUrl(
    spec: EmulatorChunkedFileSpec,
    chunk: number
): string {
    // Includ the chunk number in the URL so that we can easily generate the
    // next chunk URL. By having it in the hash we should still allow chunks
    // that have the same content hash still be an HTTP cache hit.
    return `${spec.baseUrl}/${spec.chunks[chunk]}.chunk#${chunk}`;
}

export function generateNextChunkUrl(
    url: string,
    specs: EmulatorChunkedFileSpec[]
): string {
    const match = url.match(/.*\/([0-9a-f]+)\.chunk#(\d+)$/);
    if (!match) {
        throw new Error(`Could not parse chunk URL ${url}`);
    }
    const [chunkSignature, chunkStr] = match.slice(1);
    const chunk = parseInt(chunkStr, 10);
    const spec = specs.find(spec => spec.chunks[chunk] === chunkSignature);
    if (!spec) {
        throw new Error(`Could not find spec that served ${url}`);
    }
    return generateChunkUrl(spec, chunk + 1);
}

export type EmulatorWorkerConfig = {
    jsUrl: string;
    wasmUrl: string;
    disks: EmulatorChunkedFileSpec[];
    autoloadFiles: {[name: string]: ArrayBuffer};
    persistedData?: EmulatorWorkerDirectorExtraction;
    arguments: string[];
    video: EmulatorWorkerVideoConfig;
    input: EmulatorWorkerInputConfig;
    audio: EmulatorWorkerAudioConfig;
    files: EmulatorWorkerFilesConfig;
};

export type EmulatorWorkerVideoConfig =
    | EmulatorWorkerSharedMemoryVideoConfig
    | EmulatorWorkerFallbackVideoConfig;

export type EmulatorWorkerSharedMemoryVideoConfig = {
    type: "shared-memory";
    screenBuffer: SharedArrayBuffer;
    screenBufferSize: number;
    videoModeBuffer: SharedArrayBuffer;
    videoModeBufferSize: number;
    screenWidth: number;
    screenHeight: number;
};

export type EmulatorWorkerFallbackVideoConfig = {type: "fallback"};

export type EmulatorWorkerVideoBlit =
    | EmulatorWorkerSharedMemoryVideoBlit
    | EmulatorWorkerFallbackVideoBlit;

export type EmulatorWorkerSharedMemoryVideoBlit = {
    type: "shared-memory";
};

export type EmulatorWorkerFallbackVideoBlit = {
    type: "fallback";
    data: Uint8Array;
    width: number;
    height: number;
    depth: number;
    usingPalette: number;
};

export type EmulatorWorkerInputConfig =
    | EmulatorWorkerSharedMemoryInputConfig
    | EmulatorWorkerFallbackInputConfig;

export type EmulatorWorkerSharedMemoryInputConfig = {
    type: "shared-memory";
    inputBuffer: SharedArrayBuffer;
    inputBufferSize: number;
};

export type EmulatorWorkerFallbackInputConfig = {
    type: "fallback";
    inputBufferSize: number;
};

export type EmulatorWorkerAudioConfig =
    | EmulatorWorkerSharedMemoryAudioConfig
    | EmulatorWorkerFallbackAudioConfig;

export type EmulatorWorkerSharedMemoryAudioConfig = {
    type: "shared-memory";
    audioDataBuffer: SharedArrayBuffer;
    audioDataBufferSize: number;
    audioBlockBufferSize: number;
    audioBlockChunkSize: number;
};

export type EmulatorWorkerFallbackAudioConfig = {type: "fallback"};

export type EmulatorWorkerFilesConfig =
    | EmulatorWorkerSharedMemoryFilesConfig
    | EmulatorWorkerFallbackFilesConfig;

export type EmulatorWorkerSharedMemoryFilesConfig = {
    type: "shared-memory";
    filesBuffer: SharedArrayBuffer;
    filesBufferSize: number;
};

export type EmulatorFileActions = {
    uploads: EmulatorFileUpload[];
};

export type EmulatorWorkerFallbackFilesConfig = {
    type: "fallback";
};

export type EmulatorFileUpload = {name: string; url: string; size: number};

export type EmulatorFallbackCommand =
    | EmulatorFallbackInputCommand
    | EmulatorFallbackUploadFileCommand;

export type EmulatorFallbackInputCommand = {
    type: "input";
    event: EmulatorInputEvent;
};

export type EmulatorFallbackUploadFileCommand = {
    type: "upload_file";
    upload: EmulatorFileUpload;
};

export function updateInputBufferWithEvents(
    inputEvents: EmulatorInputEvent[],
    inputBufferView: Int32Array
): EmulatorInputEvent[] {
    let hasMouseMove = false;
    let mouseMoveX = 0;
    let mouseMoveY = 0;
    let mouseButtonState = -1;
    let hasKeyEvent = false;
    let keyCode = -1;
    let keyState = -1;
    let hasStop = false;
    let hasStart = false;
    // currently only one key event can be sent per sync
    // TODO: better key handling code
    const remainingEvents: EmulatorInputEvent[] = [];
    for (const inputEvent of inputEvents) {
        switch (inputEvent.type) {
            case "touchstart":
                // We need to make sure that the mouse is first moved to the
                // current location and then we send the mousedown, otherwise
                // the Mac thinks that the mouse was moved with the button down,
                // and interprets it as a drag.
                hasMouseMove = true;
                mouseMoveX += inputEvent.dx;
                mouseMoveY += inputEvent.dy;
                remainingEvents.push({type: "mousedown"});
                break;
            case "mousemove":
                if (hasMouseMove) {
                    break;
                }
                hasMouseMove = true;
                mouseMoveX += inputEvent.dx;
                mouseMoveY += inputEvent.dy;
                break;
            case "mousedown":
            case "mouseup":
                mouseButtonState = inputEvent.type === "mousedown" ? 1 : 0;
                break;
            case "keydown":
            case "keyup":
                if (hasKeyEvent) {
                    remainingEvents.push(inputEvent);
                    break;
                }
                hasKeyEvent = true;
                keyState = inputEvent.type === "keydown" ? 1 : 0;
                keyCode = inputEvent.keyCode;
                break;
            case "stop":
                hasStop = true;
                break;
            case "start":
                hasStart = true;
                break;
        }
    }
    if (hasMouseMove) {
        inputBufferView[InputBufferAddresses.mouseMoveFlagAddr] = 1;
        inputBufferView[InputBufferAddresses.mouseMoveXDeltaAddr] = mouseMoveX;
        inputBufferView[InputBufferAddresses.mouseMoveYDeltaAddr] = mouseMoveY;
    }
    inputBufferView[InputBufferAddresses.mouseButtonStateAddr] =
        mouseButtonState;
    if (hasKeyEvent) {
        inputBufferView[InputBufferAddresses.keyEventFlagAddr] = 1;
        inputBufferView[InputBufferAddresses.keyCodeAddr] = keyCode;
        inputBufferView[InputBufferAddresses.keyStateAddr] = keyState;
    }
    if (hasStop) {
        inputBufferView[InputBufferAddresses.stopFlagAddr] = 1;
    }
    if (hasStart) {
        inputBufferView[InputBufferAddresses.stopFlagAddr] = 0;
    }
    return remainingEvents;
}
export type EmulatorWorkerDirectorExtractionEntry =
    | {
          name: string;
          contents: Uint8Array;
      }
    | {name: string; contents: EmulatorWorkerDirectorExtractionEntry[]};

export type EmulatorWorkerDirectorExtraction = {
    name: string;
    contents: EmulatorWorkerDirectorExtractionEntry[];
};

export function isDiskImageFile(name: string): boolean {
    return (
        name.endsWith(".iso") ||
        name.endsWith(".dsk") ||
        name.endsWith(".img") ||
        name.endsWith(".toast")
    );
}
