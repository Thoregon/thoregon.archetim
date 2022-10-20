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
    findPrefixClassAnnotations,
    findPostfixClassAnnotations,
    findPrefixFnAnnotations,
    findPostfixFnAnnotations,
    parseAnnotation,
    findImport,
    findExtends,
    extractSuper,
    extractClassSource,
    extractKeyValue,
}                          from "/evolux.util";

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
        const clssrc  = extractClassSource(source, clsname);

        const clsprefixannotations  = findPrefixClassAnnotations(clssrc, clsname);
        const clspostfixannotations = findPostfixClassAnnotations(clssrc,clsname);
        const cls = {};
        this.resolveAnnotation(clsprefixannotations, Cls, meta, origin, source, cls);
        this.resolveAnnotation(clspostfixannotations, Cls, meta, origin, source, cls);

        const methodannotations = this.getMethodAnnotations(Cls, meta, origin, clssrc, source);

        // todo [OPEN]: get superclasses, adjust metaclass hierarchy

        const annotations = {
            class: cls,
            methods: methodannotations
        }

        meta.useAnnotations(annotations);
    }

    getMethodAnnotations(Cls, meta, origin, clssrc, source) {
        const prot   = Cls.prototype;
        const names =  Object.getOwnPropertyNames(prot).filter((name) => isFunction(saveGetProperty(prot, name)));
        const mths = {};
        origin = originpath(origin);
        names.forEach((name) => {
            const prefix  = findPrefixFnAnnotations(clssrc, name);
            const postfix = findPostfixFnAnnotations(clssrc, name);
            const mth = {};
            if (!prefix.is_empty)
            this.resolveAnnotation(prefix, Cls, meta, origin, source, mth);
            this.resolveAnnotation(postfix, Cls, meta, origin, source, mth);

            if (!mth.is_empty) mths[name] = mth;
        })
        return mths;
    }

    resolveAnnotation(annotations, Cls, meta, origin, source, obj) {
        annotations.forEach((annotationdef) => {
            try {
                let { name, params } = this.parseAnnotation(annotationdef);
                let Annotation = dorifer.getAnnotation(name, origin);
                // const imp = findImport(source, annotation);
                // if (!imp) return;
                // const ipath    = universe.path.resolve(universe.path.dirname(origin), imp)
                obj[name] = { params };
                if (Annotation) {
                    let handler = isClass(Annotation) ? new Annotation(Cls, meta, params) : Annotation(Cls, meta, params);
                    if (handler != undefined) obj[name].handler = handler;
                }
                // todo [OPEN]: handle annotation origins
                // obj.import     = ipath;
            } catch (e) {
                console.log(">> Annotation Error", e);
            }
        });
    }

    parseAnnotation(annotationdef) {
        let name   = annotationdef.substring(1);
        let i      = annotationdef.indexOf('(');
        let params = {};
        if (i > -1) {
            name           = name.substring(0, i - 1);
            const paramdef = annotationdef.slice(i + 1, -1).trim();
            params         = paramdef.startsWith('{') ? extractKeyValue(paramdef) : primitiveTypeConvert(paramdef);
        }
        return { name, params };
    }
}
