///<reference path='noa.ts'/>

module NOA {
    export class ListAggregation extends ValueContainer { //Generic on return type!
        source: List; //TODO: remove parent?
        value;

        constructor(source: List) {
            super();
            //TODO: register at parent so the aggregate can be freed
            this.source = source;
            this.uses(source);

            source.onFree(this, () => this.free())

            source.onInsert(this, this.onSourceInsert);

            source.onSet(this, this.onSourceSet);

            source.onMove(this, this.onSourceMove);

            source.onRemove(this, this.onSourceRemove);

        }

        onSourceInsert(index: number, value) { }

        onSourceRemove(index: number, value) { }

        onSourceMove(from: number, to: number) { }

        onSourceSet(index: number, newvalue, oldvalue) { }

        updateValue(newvalue) {
            if (newvalue != this.value) {
                var old = this.value;
                this.value = newvalue;
                this.changed(newvalue, old);
            }
        }

    }

    export class ListCount extends ListAggregation {

        value: number = 0;

        constructor(source: List) {
            super(source);
            this.unlisten(source, 'move')
            this.unlisten(source, 'set')
        }

        onSourceInsert(index: number, value) {
            this.updateValue(this.value + 1)
        }

        onSourceRemove(index: number, value) {
            this.updateValue(this.value - 1)
        }

    }

    export class ListNumberCount extends ListAggregation {

        value: number = 0;

        constructor(source: List) {
            super(source);
            this.unlisten(source, 'move')
        }

        onSourceInsert(index: number, value) {
            if (NOA.isNumber(value))
                this.updateValue(this.value + 1)
        }

        onSourceRemove(index: number, value) {  //TODO: check if remove provides old value!
            if (NOA.isNumber(value))
                this.updateValue(this.value - 1)
        }

        onSourceSet(index: number, newvalue, oldvalue) {
            var lin = NOA.isNumber(newvalue);
            var rin = NOA.isNumber(oldvalue);
            if (lin && !rin)
                this.updateValue(this.value + 1)
            else if (rin && !lin)
                this.updateValue(this.value - 1);
        }
    }

    export class ListSum extends ListAggregation {

        value: number = 0;

        constructor(source: List) {
            super(source);
            this.unlisten(source, 'move')
        }

        onSourceInsert(index: number, value) {
            if (NOA.isNumber(value))
                this.updateValue(this.value + value)
        }

        onSourceRemove(index: number, value) {
            if (NOA.isNumber(value))
                this.updateValue(this.value - value)
        }

        onSourceSet(index: number, newvalue, oldvalue) {
            var delta = 0;
            if(NOA.isNumber(newvalue))
                delta += newvalue;
            if (NOA.isNumber(oldvalue))
                delta -= oldvalue;
            this.updateValue(this.value + delta);
        }
    }

    export class ListAverage extends ListAggregation {

        value: number = 0;
        sum : ListSum;
        count: ListCount;

        constructor(source: List) {
            super(source);
            this.unlisten(source, 'move')
            this.unlisten(source, 'set')
            this.unlisten(source, 'remove')
            this.unlisten(source, 'insert')

            source.aggregate(List.Aggregates.sum);
            this.sum = source.aggregates[List.Aggregates.sum];
            this.sum.live();

            source.aggregate(List.Aggregates.numbercount);
            this.count = source.aggregates[List.Aggregates.numbercount]
            this.count.live();

            this.sum.get(null, this.listChanged);
            this.count.get(null, this.listChanged);

            this.listChanged();
        }

        listChanged() {
            if (this.count.get() == 0)
                this.updateValue(0);
            this.updateValue(this.sum.get() / this.count.get());
        }

        free() {
            this.count.die();
            this.sum.die();
            super.free();
        }

    }

    export class ListMax extends ListAggregation {

        value: number = 0;

        constructor(source: List) {
            super(source);
            this.unlisten(source, 'move')

            this.findNewMax();
        }

        findNewMax () {
            var max = -1 * (1/0); // -INF

            NOA.each(this.source.cells, cell => {
                var v = cell.get();
                if (NOA.isNumber(v))
                    if (v > max)
                        max = v;
            })
            this.updateValue(max);
        }

        onSourceInsert(index: number, value) {
            if (NOA.isNumber(value) && value > this.value)
                this.updateValue(value);
        }

        onSourceRemove(index: number, value) {
            if (NOA.isNumber(value) && value >= this.value)
                this.findNewMax();
        }

        onSourceSet(index: number, newvalue, oldvalue) { 
            if (NOA.isNumber(oldvalue) && oldvalue >= this.value)
                this.findNewMax();
        }
    }

    export class ListMin extends ListAggregation {

        value: number = 0;

        constructor(source: List) {
            super(source);
            this.unlisten(source, 'move')

            this.findNewMin();
        }

        findNewMin () {
            var min = 1 * (1/0); // +NF

            NOA.each(this.source.cells, cell => {
                var v = cell.get();
                if (NOA.isNumber(v))
                    if (v < min)
                        min = v;
            })
            this.updateValue(min);
        }

        onSourceInsert(index: number, value) {
            if (NOA.isNumber(value) && value < this.value)
                this.updateValue(value);
        }

        onSourceRemove(index: number, value) {
            if (NOA.isNumber(value) && value <= this.value)
                this.findNewMin();
        }

        onSourceSet(index: number, newvalue, oldvalue) { 
            if (NOA.isNumber(oldvalue) && oldvalue <= this.value)
                this.findNewMin();
        }
    }


    export class ListIndex extends ListAggregation {

        index: number;
        realindex : number;        

        constructor(source: List, index: number) {
            super(source);
            this.index = index;
            this.updateRealIndex();
            this.update();
        }

        updateRealIndex() {
            this.realindex = this.index < 0 ? this.source.cells.length - this.index : this.index;
        }

        update() {
            if (this.realindex < 0 || this.realindex >= this.source.cells.length)
                this.updateValue(null)
            else
                this.updateValue(this.source.get(this.realindex));
        }

        onSourceInsert(index: number, value) {
            this.updateRealIndex();
            this.update();
        }

        onSourceRemove(index: number, value) {
            this.updateRealIndex();
            this.update();
        }

        onSourceMove(from: number, to: number) { 
            if (from == this.realindex || to == this.realindex)
                this.update();
        }

        onSourceSet(index: number, newvalue) { 
            if (index == this.realindex)
                this.updateValue(newvalue);
        }
    }

    export class ListFirst extends ListIndex {
        constructor(source: List) {
            super(source, 0);
        }
    }

    export class ListLast extends ListIndex {
        constructor(source: List) {
            super(source, -1);
        }
    }
}