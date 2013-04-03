///<reference path='noa.ts'/>

module NOA {


    export class CellContainer extends Base {
        fireCellChanged(index: any, newvalue: any, oldvalue: any){ NOA.notImplemented()};
        cell(index: any): Cell { NOA.notImplemented(); return null; };
    }

	export class ValueContainer extends Base {
        public value : any; //TODO: private / protected?

        public get(caller?: Base, onChange?: (newvalue : any, oldvalue: any) => void) {
            if (onChange)
                this.onChange(caller, onChange);

            return this.value;
        };

        public changed (newvalue, oldvalue) {
            var a = NOA.makeArray(arguments);
            a.unshift('changed');
            this.fire.apply(this, a);
            return this;
        }

        onChange (caller: Base, callback : (newvalue : any, oldvalue: any) => void) {
            return this.on('changed', caller, callback);

        }
    }

    /**
        TODO: make cell not depend on parent, than it can be reused among multiple parents, and be passed around 
        in, for example, sublist, reverse, count, summ, aggregations and such

        replayInserts should have an variant which does not care about ordering
    */
    export class Cell extends ValueContainer {

        private parent : CellContainer;
        index  : any = -1; //int or string
        private initialized : bool = false;

        constructor (parent : CellContainer, index, value) {
            super();
            this.parent = parent;
            this.index = index;
            this.set(value);
            this.initialized = true;
        }

        /* TODO: why?! remove () {
         if(this.parent && NOA.Record.isA(this.parent)) {
         this.parent.remove(this.index);
         } else if(this.parent && NOA.List.isA(this.parent)) {
         this.parent.remove(this.index);
         } else {
         throw "Cell.Remove can only be invoked for cells owned by a list or record!";
         }
         },*/


        hasExpression () {
            return this.value instanceof ValueContainer;
        }

        set(newvalue) {
            if(this.destroyed)
                return;

            this.debugIn("Receiving new value: " + newvalue);

            var orig = this.value;

            if(newvalue != orig) {
                var oldvalue = orig;
                if(this.hasExpression()) {
                    oldvalue = orig.get();
                    this.unlisten(orig, 'changed');
                }

                if(newvalue instanceof Base)
                    newvalue.live();

                if(orig instanceof Base)
                    orig.die();

                this.value = newvalue;

                if(this.hasExpression()) {
                    this.debug("now following", newvalue);

                    newvalue = newvalue.get((newv, oldv) => {
                        this.fireChanged(newv, oldv);
                    });
                }

                this.fireChanged(newvalue, oldvalue);
            }
            this.debugOut();
        }

        fireChanged (newv : any, oldv: any) {
            if (this.parent)
                this.parent.fireCellChanged(this.index, newv, oldv);
            this.changed(newv, oldv);
        }

        get (caller?: Base, onchange? : (newvalue : any, oldvalue: any) => void) : any {
            if(readTracker.length > 0) {
                readTracker[0][this.noaid] = this;
            }

            var res = super.get(caller, onchange)

            if (this.hasExpression)
                return res.get();
            return res;
        }

        live () {
            if(this.parent)
                this.parent.live();
            else
                super.live();
            return this;
        }

        die () {
            if(this.parent)
                this.parent.die();
            else
                super.die();
            return this;
        }

        free () {
            if(this.hasExpression())
                this.unlisten(this.value, 'changed');

            if(this.value instanceof Base)
                this.value.die();

            //this.changed(undefined); //or fireChanged?
            super.free();
        }

        toString() : string {
            return ((this.parent ? this.parent.debugName() + "." + this.index : "Cell " + this.noaid) + ":" + this.value);
        }


        public static trackReads (list : Object) {
            readTracker.unshift(list);
        }

        public static untrackReads () {
            readTracker.shift();
        }
    }

    export  var readTracker  = [];//TODO: move to expression
}
//@ sourceMappingURL=cell.js.map
