/*
 *
 * @author: Martin Neitz, Bernhard Lukassen
 */

import ThoregonEntity  from "../thoregonentity.mjs";
import MetaClass       from "../metaclass/metaclass.mjs";

export class ImageDescriptorMeta extends MetaClass {

    initiateInstance() {
        this.name = "ImageDescriptor";

        this.text ( "name");
        this.text ( "handler" );
        this.text ( "mimetype");
        this.integer ( "height");           // original size
        this.integer ( "width");            // original size
        this.collection( "tags" );
        this.image( "thumbnail" );
        this.text( "uri");                        // reference to the 'real' image
        this.collection( "variants" );      // edited images, different sizes, different usage
    }
}



export default class ImageDescriptor extends ThoregonEntity() {
    constructor(props) {
        super(props);
        Object.assign(this, props );
    }
}

ImageDescriptor.checkIn( import.meta, ImageDescriptorMeta );

