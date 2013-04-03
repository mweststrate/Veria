///<reference path='noa.ts'/>

module NOA{

    export class Record extends CellContainer {

        data = {};
        keys = new List();

        set (key : string, value : any) {
            if (!this.has(key)) {
                this.data[key] = new Cell(this, key, value);
                this.keys.add(key);
                this.fire('put',key, value, undefined); //todo, needs to fire or is done automatically?
            }

            else if (this.get(key) != value) {
                this.data[key].set(value); //fires event
            }
        }

        remove(key : string) {
            if (!this.has(key))
                return;

            this.fire('remove', key);
            this.data[key].free();

            this.keys.removeAll(key);
            delete this.data[key];
        }

        cell (key: string) : Cell{
            return this.data[key];
        }

        get(key : string, caller?: Base, onchange? : (newvalue, oldvalue) => void) {
            if (!this.has(key))
                throw "Value for '" + key + "' is not yet defined!"
            //	return null;
            return this.data[key].get(caller, onchange);
        }

        has (key: string): bool {
            return key in this.data;
        }

        replaySets(handler: (key:string, value:any)=> void) {
            for(var key in this.data) //TODO: use this.keys, to preserve order
                handler.call(key, this.get(key));
        }

        onPut (caller: Base, callback: (key : string,  newvalue : any, oldvalue : any) => void) {
            return this.on('put', caller, callback);
        }

        toObject (recurse?: bool): Object { //TODO: implement recurse
            var res = {};
            for(var key in this.data)
                res[key] = this.get(key);
            return res;
        }

        free () {
            for(var key in this.data)
                this.data[key].die().free();

            this.keys.free();
            super.free();
        }
    }
}