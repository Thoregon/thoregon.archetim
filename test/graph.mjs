/**
 *
 *
 * @author: blukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import MatterAccess from "/evolux.matter/lib/store/matteraccess.mjs";

console.log("test lucent");
import Node         from '../lib/graph/node.mjs';

let root = Node.root();

let a = root.get('a');
console.log('a', a.location);

let bbb = root.path('b.b.b');
console.log('bbb', bbb.location);

a.put('c', 'C');

a.get('d').put({ d: 'D', e: 'E' });

// console.log("a", a);

a.get('d').get('e').once(console.log);

(async () => {
    let v = await a.get('d').get('e').val;
    console.log("a.d.e", v);

    let a_ = MatterAccess.observe(a);
    console.log("dot a.d.e", await a_.d.e.val);
})();


