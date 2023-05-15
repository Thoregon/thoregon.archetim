import Channel, { ChannelMeta }      from "./channel.mjs";

/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export class QueuelMeta extends ChannelMeta {
    initiateInstance() {
        super.initiateInstance();
        this.name = "Channel";
    }
}

export default class Queue extends Channel {}

Queue.checkIn(import.meta, QueuelMeta);
