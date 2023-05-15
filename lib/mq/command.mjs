import ChannelEntry, { ChannelEntryMeta } from "./channelentry.mjs";

/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

export class CommandMeta extends ChannelEntryMeta {
    initiateInstance() {
        super.initiateInstance();
        this.name = "Command";
    }
}

export default class Command extends ChannelEntry {}

Command.checkIn(import.meta, CommandMeta);
