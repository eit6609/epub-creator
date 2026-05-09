'use strict';

const
    { forEach, isArray } = require('lodash'),
    { inspect } = require('util'),
    Joi = require('@hapi/joi');

const infoSchema = Joi.object({
    label: Joi.string().required(),
    href: Joi.string().required()
});

function stripFragment (href) {
    const fragmentIndex = href.lastIndexOf('#');
    return fragmentIndex < 0 ? href : href.substring(0, fragmentIndex);
}

class NavBuilder {

    constructor (epubBuilder) {
        this.epubBuilder = epubBuilder;
    }

    build (items) {
        this.checkItems(items);
        const ol = ['ol'];
        forEach(items, (item) => ol.push(this.buildNavItem(item)));
        this.result = ol;
    }

    buildNavItem ([{ label, href }, ...children]) {
        const li = ['li', ['a', { href }, label]];
        if (children.length > 0) {
            const ol = ['ol'];
            forEach(children, (child) => ol.push(this.buildNavItem(child)));
            li.push(ol);
        }
        return li;
    }

    checkItems (items) {
        if (!isArray(items)) {
            throw new Error(`Invalid TOC: ${inspect(items)} is not an array`);
        }
        forEach(items, (item) => {
            if (!isArray(item)) {
                throw new Error(`Invalid TOC item ${inspect(item)}: it is not an array`);
            }
            const [info, ...children] = item;
            const { error } = infoSchema.validate(info);
            if (error) {
                error.message = `Invalid TOC item info ${inspect(info)}: ${error.message}`;
                throw error;
            }
            this.epubBuilder.getFileId(stripFragment(info.href));
            this.checkItems(children);
        });
    }

}

module.exports = NavBuilder;
