/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import { AutomationService, Attach, OnMessage } from "/thoregon.truCloud";

"@AutomationService"
export default class MQService {

    "@Attach"
    async attach(handle, appinstance, home) {
        this.handle   = handle;
        this.instance = appinstance;
        this.home     = home;

        console.log(">> MQService for TEST", appinstance.qualifier);
    }

    "@OnMessage(test, test.email)"
    receive(evt) {
        console.log("** TEST MQ Service", JSON.stringify(evt, null, 2));
    }
}

MQService.checkIn(import.meta);
