import { Observable } from '@nativescript/core/data/observable';
import { ChangeType, ChangedData } from '@nativescript/core/data/observable-array';

const CHANGE = 'change';

declare class ObservableArrayType<T> extends Observable {
    getItem(index: number): T;
    setItem(index: number, value: T);
}
type MyProxyConstructor = (new <T>(...args) => ObservableArrayType<T> & T[]) & {changeEvent: string};

class ObservableArrayInsideObservable<T> extends Observable {
    _addArgs?: ChangedData<T>;
    _deleteArgs?: ChangedData<T>;
    parent: WeakRef<MyProxyConstructor>;
    toString() {
        return '[ObservableArrayInsideObservable]';
    }
    constructor(parent) {
        super();
        this.parent = new WeakRef(parent);
        this._addArgs = {
            eventName: CHANGE,
            action: ChangeType.Add,
            index: null as any,
            removed: [],
            addedCount: 1,
        } as any;

        this._deleteArgs = {
            eventName: CHANGE,
            action: ChangeType.Delete,
            index: null as any,
            removed: null as any,
            addedCount: 0,
        } as any;
    }

    notify(args) {
        const parent = this.parent && this.parent.get();
        args.object = parent || args.object;
        super.notify(args);
    }
    _notifyLengthChange() {
        const parent = this.parent && this.parent.get();
        if (parent)  {
            const lengthChangedData = this._createPropertyChangeData('length', parent.length);
            this.notify(lengthChangedData);
        }
    }
}
let ID_INCREMENT = 0;
export  class ObservableArray<T>{
    public static changeEvent = CHANGE;
    length: number;
    private _observable: ObservableArrayInsideObservable<T>;
    // push,, shift ... will trigger set proxy handler call
    // in those cases we dont want single change notification
    // we will trigger after the full operation is finished
    private shouldIgnoreSet = false;

    // reverse will call delete, push ....
    // in those cases we dont want single change notification
    // we will trigger after the full operation is finished
    private shouldIgnoreOps = false;

    constructor(...args) {
        let result;
        if (args.length === 1) {
            result = new Proxy(args[0].slice(), this);
        } else {
            result =  new Proxy([...args], this);
        }
        this._observable = new ObservableArrayInsideObservable<T>(result);
        result.id = ID_INCREMENT++;
        return result;
    }

    toString() {
        return '[ObservableArray]';
    }
    
    static [Symbol.hasInstance](instance) {
        return true;
    }
    getPrototypeOf (target) {
        return Observable.prototype;
    }
    get(target, prop) {
        
        if (typeof prop === 'symbol') {
            return target[prop];
        }
        const that = this;
        const notifier = that._observable;
        const val = target[prop];
        // console.log('get', prop);
        if (!val) {
            if (!val && typeof notifier[prop] === 'function') {
                return notifier[prop].bind(notifier);
            } else if (prop === 'getItem') {
                return function (index){
                    return target[index]
                };
            } else if (prop === 'setItem') {
                return function (index, value){
                    return this[index] = value;
                };
            }
        } else if (typeof val === 'function') {
            if (prop === 'toString') {
                return function (){
                    return JSON.stringify(target);
                };
            }
            if (this.shouldIgnoreOps) {
                return val;
            }
            // TODO: do we need concat? does not seem to make sense
            if (prop === 'concat') {
		        notifier._addArgs.index = this.length;
            }

            if (prop === 'reverse') {
		        return function (el) {
                    that.shouldIgnoreSet = true;
                    const removed = [...target];
                    const result = Array.prototype[prop].apply(this, arguments);
                    that.shouldIgnoreSet = false;
                    notifier.notify({
                        eventName: CHANGE,
                        action: ChangeType.Splice,
                        index: 0,
                        removed,
                        addedCount: target.length,
                    });
                    return result;
                };
            }
            if (prop === 'push') {
                return function (el) {
                    notifier._addArgs.index = target.length;
                    that.shouldIgnoreSet = true;
                    const result = Array.prototype[prop].apply(this, arguments);
                    that.shouldIgnoreSet = false;
                    notifier._addArgs.addedCount = target.length - notifier._addArgs.index;

                    notifier.notify(notifier._addArgs);
                    notifier._notifyLengthChange();
                    return result;
                };
            }
            if (prop === 'unshift') {
                return function (el) {
                    const length = target.length;
                    that.shouldIgnoreSet = true;
                    const result = Array.prototype[prop].apply(this, arguments);
                    that.shouldIgnoreSet = false;
                    notifier._addArgs.index = 0;
                    notifier._addArgs.addedCount = result - length;
                    notifier.notify(notifier._addArgs);
                    notifier._notifyLengthChange();

                    return result;
                };
            }
            if (prop === 'pop') {
                return function (el) {
                    notifier._deleteArgs.index = target.length - 1;
                    that.shouldIgnoreSet = true;
                    const result = Array.prototype[prop].apply(this, arguments);
                    that.shouldIgnoreSet = false;
                    notifier._deleteArgs.removed = [result];
                    notifier.notify(notifier._deleteArgs);
                    notifier._notifyLengthChange();
                    return result;
                };
            }
            if (prop === 'shift') {
                return function (el) {
                    that.shouldIgnoreSet = true;
                    const result = Array.prototype[prop].apply(this, arguments);
                    that.shouldIgnoreSet = false;
                    notifier._deleteArgs.index = 0;
                    notifier._deleteArgs.removed = [result];
                    notifier.notify(notifier._deleteArgs);
                    notifier._notifyLengthChange();
                    return result;
                };
            }
            if (prop === 'splice') {
                return function (start) {
                    const length = target.length;
                    that.shouldIgnoreSet = true;
                    const result = Array.prototype[prop].apply(this, arguments);
                    that.shouldIgnoreSet = false;
                    notifier.notify({
                        eventName: CHANGE,
                        action: ChangeType.Splice,

                        // The logic here is a bit weird; so lets explain why it is written this way
                        // First of all, if you ADD any items to the array, we want the index to point to
                        //   the first value of the index, so this fixes it when you put a value to high in
                        // If you remove items from the array, then the index needs to point to the INDEX
                        //   where you removed the item.
                        // If you add and remove items, the index will point to the remove location as that
                        //   is the index you passed in.
                        index: Math.max(Math.min(start, length - (result.length > 0 ? 1 : 0)), 0),
                        removed: result,
                        addedCount: target.length + result.length - length,
                    });
                    if (target.length !== length) {
                        notifier._notifyLengthChange();
                    }
                    return result;
                };
            }
        }
        return val;
    }
    set(target, key, value) {
        let event;
        if (Number.isInteger(Number(key)) || key === 'length') {
            if (!this.shouldIgnoreSet) {
                event  ={
                    eventName: CHANGE,
                    action: ChangeType.Update,
                    index: key,
                    removed: [target[key]],
                    addedCount: 1,
                };
            }
        }
        target[key] = value;
        if (event) {
            this._observable.notify(event);
        }
        return true;
    }
    deleteProperty(target, key) {
        const notifier = this._observable;
        let event;
        if (Number.isInteger(Number(key)) || key === 'length') {
            if (!this.shouldIgnoreSet) {
                event = {
                    eventName: CHANGE,
                    action: ChangeType.Update,
                    index: key,
                    removed: [target[key]],
                    addedCount: 1,
                };
            }
        }
        delete target[key];
        if (event) {
            notifier.notify(event);
        }
        return true;
    }
}
