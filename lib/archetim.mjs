/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { doAsync }      from "/evolux.universe";
import { EventEmitter } from "/evolux.pubsub";
import { Reporter }     from "/evolux.supervise";
import Node             from "./graph/node.mjs";
import MatterAccess     from "/evolux.matter/lib/store/matteraccess.mjs";

const isDev = () => { try { return thoregon.isDev } catch (ignore) { return false } };

export default class Archetim extends Reporter(EventEmitter) {

    constructor() {
        super();
        this._galaxymapping = {};
        // this._matter = Node.root(!isDev() ? new MatterContentHandler() : undefined, STRANGENESS);
    }

    init() {
        if (!this.hasContext()) return;
        // create:
        //  - get 'stangeness'
        //  - universe.galaxies
        //  - me.galaxies
        const STRANGENESS = universe.STRANGENESS;

    }

    cleanup() {

    }

    useContext(app, ssi) {
        this.logger.info('%% Archetim', app, ssi);
        this._app = app;
        this._sst = ssi;

        // const identity = await Facade.use(await WorkerProvider.from('/thoregon.identity/lib/identityservice.mjs'));

        this.init();
    }

    hasContext() {
        return this._app != undefined && this._ssi != undefined;
    }

    get persitenceRoot() {
        if (this._root == undefined) this._root = universe.matter;
        return this._root;
    }

    /**
     * overrides a top level entry in a galaxy
     * use only in dev mode
     * ignored when not in dev mode
     *
     * @param name
     * @param content
     */
    overrideForTest(name, content) {
        if (!thoregon.isDev) return;
        this._galaxymapping[name] = content;
        this._root = MatterAccess.observe(Node.root());   // todo [REFACTOR]: use another 'debug' setting, in dev mode we may need the universe persistence
    }

    /**
     * Called when the universe is inflated.
     * todo [OPEN]: Seal contexts (don't allow adding contexts by API without signature)
     */
    async inflated() {
        this.logger.info("%% Archetim received inflated.");
    }

    /*
     * service implementation.
     * on start setup the tru cloud
     */

    install() {}
    uninstall() {}
    resolve() {}
    async start() {
        universe.archetim = this;
        this.emit('ready', { archetim: this });
    }
    async stop() {
        await this.cleanup();
        this.emit('exit', { archetim: this });
    }

    update() {}


    /*
     * EventEmitter implementation
     */

    get publishes() {
        return {
            ready       : 'Dorifer ready',
            exit        : 'Dorifer exit',
        };
    }
}
