module NOA {

	export class List extends NOA.CellContainer {

		static Aggregates = { count : "count", numbercount: "numbercount", sum : "sum", min: "min", max : "max", vag : "avg", first : "first", last : "last" };

		cells = [];
		aggregates = {};

		constructor() {
			super();
		}

		/** core functions */
			insert (index: number, value) : List {
			this.debugIn("Insert at " + index + ": " + value);

			var cell = new NOA.Cell(this, index, value);
			this.cells.splice(index, 0, cell);

			this._updateIndexes(index +1, 1);
			this.fire('insert', index, cell.value);

			this.debugOut();
			return this;
		}

		set (index : number, value) : List {
			this.debugIn("Set at " + index + ": " + value);

			this.cells[index]._store(value);

			this.debugOut();
			return this;
		}

		remove (index : number) : any {
			this.debugIn("Remove at " + index);

			var origcell = this.cells[index];
			var origvalue = origcell.get();

			this.cells.splice(index, 1);
			this._updateIndexes(index, -1);

			this.fire('remove', index, origvalue);

			origcell.free();
			this.debugOut();
			return origvalue;
		}

		move (from : number, to : number) : List {
			if (from == to)
				return this;

			this.debugIn("Move from " + from + " to " + to);

			var c = this.cells[from];
			c.index = to;

			if (from > to) {
				this._updateIndexes(to, from, 1);
				c.index = to;
				this.cells.splice(from, 1);
				this.cells.splice(to,0,c);
			}
			else { //from < to
				this._updateIndexes(from, to, -1);
				this.cells.splice(to,0,c);
				this.cells.splice(from, 1);
				this.cells[to].index = to;
			}

			this.fire('move', from, to);

			this.debugOut();
			return this;
		}

		cell (index: number) : NOA.Cell {
			return this.cells[key];
		}

		/** events */

			onInsert(caller: NOA.Base, cb : (index: number, value) => void) : List {
			this.on('insert', caller, cb);
			return this;
		}

		onMove(caller: NOA.Base, cb : (from : number, to: number) => void) : List {
			this.on('move', caller, cb);
			return this;
		}

		onRemove(caller: NOA.Base, cb : (from : number, value) => void): List {
			this.on('remove', caller, cb);
			return this;
		}

		onSet(caller: NOA.Base, cb : (index : number, value) => void) : List{
			this.on('set', caller, cb);
			return this;
		}

		/** householding */

			_updateIndexes (start : number, end : number, delta? : number) : List{
//TODO: move end to the third argument to simplify the code        
//debugger;
			if (arguments.length == 2) {
				var l = this.cells.length;
				for(var i = start; i < l; i++)
					this.cells[i].index += end;
			}
			else if (arguments.length == 3)
				for(var i = start; i < end; i++)
					this.cells[i].index += delta;
			return this;
		}

		replayInserts(cb : (index: number, value: any) => void) {
			var l= this.cells.length;
			for(var i = 0; i < l; i++)
				cb(i, this.get(i));
		}

		/** child functions */

		/**
		 * Constructs a new list with all the mapped items in this list. If name is defined, the current value to which the filter is applied is available
		 * in func as this.variable(x), and it is available as the first argument
		 * @param  {[type]} name of the variable in the scope [description]
		 * @param  {[type]} func [description]
		 * @return {[type]}
		 */
		map (name : string, func : NOA.Expression) : List ;
		map (name : string, func : (value : any) => any) : List {

			//TODO: memoize these calls?
			var list = new NOA.List(this);

			var basescope = NOA.Scope.getCurrentScope();

			var insert = function(index, value) {

				var source = list.parent.cell(index);
				var scope = NOA.Scope.newScope(basescope);
				scope[name] = source;

				//new way
				var a;
				if (NOA.isFunction(func))
					a = new NOA.Expression(func, scope)
				else if (func instanceof NOA.Expression)
					a = func;
				else
					throw "Map function should be JS function or expression"
				//var a = new NOA.core.Expression(null, func, scope, this, source); //source will be both available as this.variable('name') or as the first arg in 'func'.
				//TODO:?          a = a.listenTo(source, 'free', a.die or free); //destruct on free ASAP, othwerise unnecesary applications will be triggered.

				//first create the new cell with the value, then start listening (otherwise a temp cell would create unecessary events)
				list.insert(index, a);
			};

			//map all events
			this.replayInserts(insert);

			this.onInsert(list, insert);

			this.onRemove(list, idx => list.remove(idx))

			this.onMove(list, (from : number, to : number) => list.move(from, to))

			return list;
		}

		/**
		 * Constructs a new list with all the items of which func applies true. If name is defined, the current value to which the filter is applied is available
		 * in func as this.variable(x), or, as the first argument
		 * @param  {[type]} name of the variable in the scope [description]
		 * @param  {[type]} func [description]
		 * @return {[type]}
		 */
			filter (name : string, func : NOA.Expression ) : List;
		filter (name : string, func : (value : any) => bool ) : List {
			var mapping = [];

			var list = new NOA.List(this);
			var maplist =  list._filtermap = this.map(name, func).debugName("filterHelperMap").live(); //use a map to react properly to result changes and avoid code duplication

			list.onFree(() => maplist.die()); //make the maplist come to live


			function updateMapping(index : number, delta : number, to? : number) {
				var l = to ? to : mapping.length;
				for(var i = index; i < l; i++) {
					var m = mapping[i];
					mapping[i] = [m[0] + delta, m[1]];
				}
			}

			function insert(index : number, value){
				var tidx = 0, l = mapping.length;
				if (index < l)
					tidx = mapping[index][0];
				else if (l > 0)
					tidx = mapping[l-1][0] +1; //+1?

				if (value == true) {
					//insert new entry in the mapping
					mapping.splice(index, 0, [tidx, true]);
					//update all next entries in the mappings with +1.
					updateMapping(index + 1, 1);
					//insert the proper value from parent. A cell will be followed automatically
					list.insert(tidx, this.parent.cell(index));
				}
				else
				//just insert the new entry, no further update needed
					mapping.splice(index, 0, [tidx, false]); //nothing changed, but insert extra record in the mapping

			};
			maplist.onInsert(insert);

			maplist.onSet(function(index, should) {
				//console.info(this.toArray());
				//debugger;
				var tidx = mapping[index][0];
				//Note, this func only fires if should changed, so we can rely on that
				if (should) {
					//update new entry in the mapping
					mapping[index] = [tidx, true];
					//update all next entries in the mappings with +1.
					updateMapping(index + 1, 1);
					//insert the proper value from parent
					list.insert(tidx, list.parent.cell(index));
				}
				else {
					list.remove(tidx);
					mapping[index] = [tidx, false];
					updateMapping(index + 1, -1);
				}
			});


			maplist.onRemove(function(index : number) {
				//debugger;
				var tidx = mapping[index][0];
				var has =  mapping[index][1];

				if (has) {
					list.remove(tidx);
					updateMapping(index +1, -1);
				}

				mapping.splice(index, 1);
			});

			maplist.onMove(function(from : number, to : number){
				var tidx = mapping[to][0];
				var fidx = mapping[from][0];
				var hasf = mapping[from][1];

				if (hasf)
					list.move(fidx, tidx);

				if (to < from) {
					if (hasf)
						updateMapping(to, 1, from -1);
					mapping.splice(from, 1);
					mapping.splice(to, 0, [tidx, hasf]);
				}
				else { //to > from
					if (hasf)
						updateMapping(from + 1 , -1, to); //to -1 ?
					mapping.splice(to, 0, [tidx, hasf]);
					mapping.splice(from, 1);
				}
			});

			maplist.replayInserts(insert);

			return list;
		}


		/**
		 *
		 *
		 * Was here..
		 *
		 * @param  {[type]} begin [description]
		 * @param  {[type]} end   [description]
		 * @return {[type]}       [description]
		 */
			subset(begin: number, end : number) : List {
			var list = new NOA.List(this);
			var l = Math.min(this.cells.length, end);
			////debugger;
			//map all cells
			for(var i = begin; i < l; i++)
				list.add(this.cells[i].getValue());

			function removeLast() {
				if (list.cells.length > end - begin)
					list.remove(list.cells.length - 1); //remove the last
			}

			function addLast() {
				if (end < list.parent.cells.length) //add another item at the end
					list.add(list.parent.cells[end].get());
			}

			function removeFirst() {
				if (end - begin > 0)
					list.remove(0); //remove the first

			}

			function addFirst() {
				if (begin < list.parent.cells.length)
					list.insert(0, list.parent.cells[begin].get()); //insert the new first item
			}

			list.listenTo(this, 'insert', function(index, value) {
				if (index < begin) { //Item inserted before the subset
					removeLast();
					addFirst();
				}
				else if (index >= begin && index < end) { //item inserted within the subset
					removeLast();
					this.insert(index - begin, value);
				}
			});

			list.listenTo(this, 'set', function(index, value) {
				if (index >= begin && index < end)
					this.set(index - begin, value);
			});

			list.listenTo(this, 'remove', function(index) {
				if (index < begin) {
					removeFirst();
					addLast();
				}
				else if (index >= begin && index < end) {

					this.remove(index - begin); //remove the item in the list

					addLast();
				}
			});

			list.listenTo(this, 'move', function(from, to) {
				if ((from < begin && to < begin) || (from > end && to > end))
					return; //not interesting, out the range and both on the same side

				var f = from - begin;
				var t = to - begin;
				var l = end - begin;

				if (f >= 0 && f < l && t >= 0 && t <  l) //within this subset
					this.move(f, t);
				else {
					//To is in this range (and from is not..)
					if (t >= 0 && t < l) {
						this.insert(t, parent.get(from));
						if (f < 0) { //item was original before this subset, move the set
							removeFirst();
							addLast();
						}
						else
							removeLast();
					}
					else { //From is in this range (and to is not)
						this.remove(f);
						if (t < 0) { //item is moved before this subset, move the set
							addFirst();
							removeLast();
						}
						else
							addLast();
					}
				}
			});

			return list;
		}

		reverse () : List{
			var list = new NOA.List(this);
			var l = this.cells.length;

			//map all cells
			for(var i = l - 1; i>= 0; i--)
				list.add(this.cells[i].getValue());

			list.listenTo(this, 'insert', function(index, value) {
				this.insert(this.cells.length - index, value);
			});

			list.listenTo(this, 'set', function(index, value) {
				this.set(index, value);
			});

			list.listenTo(this, 'remove', function(index) {
				this.remove(this.cells.length - index - 1);
			});

			list.listenTo(this, 'move', function(from, to) {
				this.move(this.cells.length - from - 1, this.cells.length - to - 1);
			});


			return list;
		}

		sort (comperator) { //TODO: do not support comperators
			var list = new NOA.List(this);
			var mapping = [];

			function updateMapping(from, delta) {
				var l = mapping.length;
				for(var i = 0; i < l; i++)
					if (mapping[i] >= from)
						mapping[i] += delta;
			}

			//Comperator function
			var func = comperator;
			if (comperator == null)
				func = function(a, b) {
					if (a == b)
						return 0;
					else if (a < b)
						return -1;
					else
						return 1;
				};

			//Comperator wrap function
			var searcher = function(a, b) {
				return func(a, b.get()); //b is a cell, so unwrap the value
			};

			//reusable insert function
			var insert = function(base, value, _knownindex) {
				var nidx = _knownindex;
				if (nidx === undefined)
					nidx = NOA.util.binarySearch(this.cells, value, searcher);

				this.insert(nidx, value);
				updateMapping(nidx, 1);
				mapping.splice(base, 0, nidx);
			};

			var remove = function(base) {
				var idx = mapping[base];
				this.remove(idx);
				updateMapping(idx, -1);
				mapping.splice(base, 1);
			}

			var set = function(index, value) {
				var baseidx = mapping[index];
				var nidx = NOA.util.binarySearch(this.cells, value, searcher);
				if (nidx != baseidx) {
					remove.call(this, index);
					insert.call(this, index, value, nidx);
				}
				else //just update
					this.set(index, value);
			};

			var l = this.cells.length;
			for(var i = 0; i < l; i++)
				insert.call(list, i, this.cells[i].getValue());

			list.listenTo(this, 'insert', insert);

			list.listenTo(this, 'set', set);

			list.listenTo(this, 'remove', remove);

			//no need to listen to move

			return list;
		}

		distinct () {
			var occ = {};

			var toKey = function(value) {
				if (value === null || value === undefined)
					return "";
				if (value instanceof NOA.Base)
					return "$$NOA#" + value.noaid;
				return value.toString();
			}

			var l = this.cells.length;
			var list = new NOA.List(this);

			var insert = function(index, value) {
				var key = toKey(value);
				var has = key in occ;
				if (!has) {
					this.add(value);
					occ[key] =  1;
				}
				else
					occ[key] += 1;
			};

			var remove = function(index, value) {
				var key = toKey(value);
				var has = key in occ;
				if (has) {
					occ[key] -= 1;
					if (occ[key] == 0) {
						this.removeAll(value);
						delete occ[key];
					}
				}
			};

			for(var i = 0; i < l; i++)
				insert.call(list, i, this.cells[i].getValue());

			list.listenTo(this, 'insert', insert);

			list.listenTo(this, 'set', function(index, value, orig) {
				remove.call(this, index, orig);
				insert.call(this, index, value);
			});

			list.listenTo(this, 'remove', remove);

			//no need to listen to move

			return list;
		}

		join () {
			//      debugger;
			var list = new NOA.List(this);
			//list with item -> [offset, length]
			var lmap = [];

			var updateLmap = function(index, delta) {
				lmap[index][1] += delta;
				for(var i = index + 1; i < lmap.length; i++)
					lmap[i][0] += delta;
			}

			var setupSublist = function(index, sublist) {
				var cell = list.parent.cell(index); //the cell knows our position in lmap reliable when handling events
				var sublistInsert = function(subindex, subvalue) {
					this.insert(lmap[cell.index][0] + subindex, subvalue);
					updateLmap(cell.index, +1);
				}

				sublist.replayInserts(sublistInsert);

				list.listenTo(sublist, 'insert', sublistInsert);
				list.listenTo(sublist, 'move', function(sf, st) {
					this.move(lmap[cell.index][0] + sf, lmap[cell.index][0] + st);
				});
				list.listenTo(sublist, 'remove', function(sf) {
					this.remove(lmap[cell.index][0] + sf);
					updateLmap(cell.index, -1);
				});
				list.listenTo(sublist, 'set', function(sf, value) {
					this.set(lmap[cell.index][0] + sf, value);
				});
			}

			var insert = function(index, value) {
				var start = index == 0 ? 0 : lmap[index -1][0] + lmap[index -1][1];
				if (!(value instanceof NOA.List)) { //plain value, insert right away
					lmap.splice(index, 0, [start,1]);
					list.insert(start, value);
				}
				else { //list
					lmap.splice(index, 0, [start, 0]);
					setupSublist(index, value);
					//               value.live();
				}
			}

			var remove = function(index, value) {
				if (value instanceof NOA.List) {
					list.debug("removed list " + value + " at " + index);
					list.unlistenTo(value, 'insert');
					list.unlistenTo(value, 'set');
					list.unlistenTo(value, 'remove');
					list.unlistenTo(value, 'move');
					//               value.die();
				}

				var size = lmap[index][1];
				updateLmap(index, -1*size);
				for(var i = 0; i < size; i++)
					list.remove(lmap[index][0]);
				lmap.splice(index, 1);
			}

			this.replayInserts(insert);
			list.listenTo(this, 'insert', insert);
			list.listenTo(this, 'set', function(index, newvalue, oldvalue) {
				remove(index, oldvalue);
				insert(index, newvalue);
			});
			list.listenTo(this, 'remove', remove);
			list.listenTo(this, 'move', function(from, to) {
				//this can be done in an intelligent way by moving the items, but, its complicated since we already captured in the scope
				//just, copy the original from and to value and re-apply remove and insert at the proper indexes
				remove(from, this.parent.get(from)); //pass the old value to remove, to unlisten the changes
				insert(from, this.parent.get(from));
				remove(to, this.parent.get(to)); //pass the old value
				insert(to, this.parent.get(to));
			});

			return list;
		}

		/** aggregate */



			sum () {

		}

		min () {

		}

		max () {

		}

		avg () {

		}

		count () {

		}

		first () {

		}

		numbercount () {

		}

		last () {

		}

		/** util functions */

			add (value, cont) {
			this.insert(this.cells.length, value);
			//return this.cells.length - 1;
			return this;
		}

		get (index : string);
		get (index : number);
		get (index : string, caller: NOA.Base, onchange : (newvalue, oldvalue)=>void);
		get (index : number, caller: NOA.Base, onchange : (newvalue, oldvalue)=>void) {

			if (NOA.type(index) == "Number")
				return this.cells[index].get(caller, onchange);

			if (this.aggregates[index])
				return this.aggregates[index].get(caller, onchange)

			//check if index is a known aggregate class?
			if (!(NOA[index] && NOA[index].prototype == NOA.ListAggregation))
				throw "Unknown aggregate: " + index;

			var a = this.aggregates[index] = this[index](); //invokes aggregation
			return a.get(onchange);
		}

		toArray (recurse? : bool) { //TODO: implement recurse
			var res = [];
			var l = this.cells.length;
			for(var i = 0; i < l; i++)
				res.push(this.get(i));
			return res;
		}

		removeAll (value) {
		for(var i = this.cells.length -1 ; i >=0; i--) {
			if (this.get(i) == value)
				this.remove(i);
		}
	}

		free () {
			console.log("freeing " + this.cells.length)
			for (var i = this.cells.length -1; i >= 0; i--)
				this.cells[i].free();

			//TODO: free aggregates
		}

		/* toString : function() {
		 var res = [];
		 var l = this.cells.length;
		 for(var i = 0; i < l; i++)
		 res.push(this.get(i));
		 return "[" + res.join(",") + "]";
		 }
		 */

	}





}