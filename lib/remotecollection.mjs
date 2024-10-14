/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */
import RemoteDirectory from "./remotedirectory.mjs";

export default class RemoteCollection extends RemoteDirectory {

    // todo [REFACTOR]: check which methods must be implemented locally
    //  - add(entry)
    //  - includes(item)
    //  - drop(key)

}

if (globalThis.universe) universe.$Collection = RemoteCollection;