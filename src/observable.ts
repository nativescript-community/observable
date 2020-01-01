import { EventData, Observable as NObservable } from '@nativescript/core/data/observable';
declare module '@nativescript/core/data/observable' {
    interface Observable {
        _getEventList(eventName: string, createIfNeeded?: boolean): any[];
    }
}

export default class Observable extends NObservable {
    onListenerAdded(eventName: string, count: number) {}
    onListenerRemoved(eventName: string, count: number) {}
    public addEventListener(eventNames: string, callback: (data: EventData) => void, thisArg?: Object) {
        super.addEventListener(eventNames, callback, thisArg);
        const events = eventNames.split(',');
        for (let i = 0, l = events.length; i < l; i++) {
            const event = events[i].trim();
            const list = this._getEventList(event);
            this.onListenerAdded(event, list ? list.length : 0);
        }
    }
    public removeEventListener(eventNames: string, callback?: any, thisArg?: Object) {
        super.removeEventListener(eventNames, callback, thisArg);
        const events = eventNames.split(',');
        for (let i = 0, l = events.length; i < l; i++) {
            const event = events[i].trim();
            const list = this._getEventList(event);
            this.onListenerRemoved(event, list ? list.length : 0);
        }
    }
    on(eventNames: string, callback: (data: EventData) => void, thisArg?: any) {
        super.on(eventNames, callback, thisArg);
        return this;
    }


    once(event: string, callback: (data: EventData) => void, thisArg?: any){
        super.once(event, callback, thisArg);
        return this;
    }

    off(eventNames: string, callback?: any, thisArg?: any){
        super.off(eventNames, callback, thisArg);
        return this;
    }
}
