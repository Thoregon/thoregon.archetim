/*
 * Copyright (c) 2021.
 */

/*
 *
 * @author: Martin Neitz
 */

import ThoregonEntity  from "/thoregon.archetim/lib/thoregonentity.mjs";
import MetaClass       from "/thoregon.archetim/lib/metaclass/metaclass.mjs";

export class ImageDescriptorMeta extends MetaClass {

    initiateInstance() {
        this.name = "ImageDescriptor";

        this.text ( "name");
        this.text ( "handler" );
        this.text ( "mimetype");
        this.integer ( "height");
        this.integer ( "width");
    }
}


export default class ImageDescriptor extends ThoregonEntity() {
    constructor(props) {
        super(props);
        Object.assign(this, props );
    }
}

ImageDescriptor.checkIn( import.meta, ImageDescriptorMeta );

