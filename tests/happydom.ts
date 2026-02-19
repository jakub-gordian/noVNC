import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Fix happy-dom WheelEvent not passing MouseEvent init properties (clientX, clientY, etc.)
const OriginalWheelEvent = globalThis.WheelEvent;
globalThis.WheelEvent = class PatchedWheelEvent extends OriginalWheelEvent {
    constructor(type: string, init?: WheelEventInit) {
        super(type, init);
        if (init) {
            // happy-dom's WheelEvent doesn't pass these to MouseEvent
            if (init.clientX !== undefined) {
                Object.defineProperty(this, 'clientX', { value: init.clientX, writable: false });
            }
            if (init.clientY !== undefined) {
                Object.defineProperty(this, 'clientY', { value: init.clientY, writable: false });
            }
            if (init.screenX !== undefined) {
                Object.defineProperty(this, 'screenX', { value: init.screenX, writable: false });
            }
            if (init.screenY !== undefined) {
                Object.defineProperty(this, 'screenY', { value: init.screenY, writable: false });
            }
            if (init.buttons !== undefined) {
                Object.defineProperty(this, 'buttons', { value: init.buttons, writable: false });
            }
        }
    }
} as any;
