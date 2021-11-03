/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class CollectionProvider {

    withFilters(filternames) {
        this._filters = filternames;
        this.refresh();
    }

    withSort(sort) {
        this._sort = sort;
    }

    setFilter(filter, value) {
        this.refresh();
    }

    /**
     *
     * @param name
     * @param direction -1 for descending, 0 remove sort, 1 for ascending
     */
    setSort(name, direction) {

    }

    refresh() {
        // implement by subclass
    }
}
