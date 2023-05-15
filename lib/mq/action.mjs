/**
 * Superclass for implementing actions for events and commands
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export default class Action {

    /**
     * prepare the action with an entry. the entry will be a
     * - Command
     * - Event
     *
     * @param entry
     */
    prepare(entry) {
        // implement by subclass
    }

    /**
     * perform the action based on the entry
     */
    run() {
        // implement by subclass
    }

    /**
     * now cleanup.
     * if there was an error during 'prepare' or 'run, it will be supplied
     *
     * @param err
     */
    cleanup(err) {
        // implement by subclass
    }
}
