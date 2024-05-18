/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import {
    isFunction,
    isClass,

    primitiveTypeConvert,
    extractKeyValue,

    extractClassSource,
    parsePrefixClassAnnotations,
    extractMethodsSource,
    parseMethodAnnotations,
}                                      from "/evolux.util";

const saveGetProperty = (obj, prop) => {
    try {
        return Reflect.get(obj, prop);
    } catch (ignore) {
        return undefined;
    }
}

const originpath = (origin) => origin.startsWith('file:') ? origin.substring(6) : origin;
//------------------------------

export default class AnnotationParser {

    async analyze(Cls, meta, origin) {
        const source = await thoregon.source(origin);
        if (!source || source.indexOf('"@') < 0) return;   // shortcut if no annotations

        const clsname = Cls.name;
        const clssrc  = source; // extractClassSource(source, clsname);

        const clsprefixannotations  = parsePrefixClassAnnotations(clssrc);

        // const clsprefixannotations  = findPrefixClassAnnotations(clssrc, clsname);
        // const clspostfixannotations = findPostfixClassAnnotations(clssrc,clsname);
        const cls = {};
        const annotations = {
            class: cls,
            methods: {},
        }

        meta.useAnnotations(annotations);

        this.resolveAnnotation(clsprefixannotations, Cls, undefined, meta, origin, cls);
        // this.resolveAnnotation(clspostfixannotations, Cls, undefined, meta, origin, cls);

        const methodannotations = this.findMethodAnnotations(Cls, meta, origin, clssrc);
        annotations.methods = methodannotations;

        // todo [OPEN]: get superclasses, adjust metaclass hierarchy

    }

    findMethodAnnotations(Cls, meta, origin, clssrc) {
        const proto            = Cls.prototype;
        const classbody        = extractMethodsSource(clssrc);
        const annotatedMethods = parseMethodAnnotations(classbody);
        const mths             = {};
        if (!classbody) return mths;
        Object.entries(annotatedMethods).forEach(([name, methodannotations]) => {
            if (!isFunction(saveGetProperty(proto, name))) return;        // sanity, skip annotaions which does not match a method of the class
            const mth = {};
            this.resolveAnnotation(methodannotations, Cls, name, meta, origin, mth);
            if (!mth.is_empty) mths[name] = mth;
        })
        return mths;
    }

    resolveAnnotation(annotations, Cls, mthname, meta, origin, obj) {
        annotations.forEach((annotationdef) => {
            try {
                let { annotation, parameters } = annotationdef;
                let params                     = parameters?.startsWith('{') ? extractKeyValue(parameters) : primitiveTypeConvert(parameters);
                let Annotation             = dorifer.getAnnotation(annotation, origin);
                obj[annotation]                  = { params };
                if (Annotation) {
                    let handler = isClass(Annotation) ? new Annotation(Cls, mthname, meta, params) : Annotation(Cls, mthname, meta, params);
                    if (handler != undefined) obj[annotation].handler = handler;
                }
                // todo [OPEN]: handle annotation origins
            } catch (e) {
                console.log(">> Annotation Error", e);
            }
        });
    }
}
