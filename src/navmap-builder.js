'use strict';

const
    { forEach, isArray } = require('lodash'),
    { inspect } = require('util'),
    Joi = require('@hapi/joi');

const FORMATTER = new Intl.NumberFormat('en', { minimumIntegerDigits: 6, useGrouping: false });

const infoSchema = Joi.object({
    label: Joi.string().required(),
    href: Joi.string().required()
});

/*
items is a list of arrays with the info object and, optionally, other items:
[
    [{ label: '1', href: '1.html' }],
    [{ label: '2', href: '1.html' },
        [{ label: '2.1', href: '2.html#2_1' }],
        [{ label: '2.2', href: '2.html#2_2' },
            [{ label: '2.2.1', href: '2.html#2_2_1' }]],
        [{ label: '2.3', href: '2.html#2_3' }]],
    [{ label: '3', href: '3.html' }],
]
*/

function stripFragment (href) {
    const fragmentIndex = href.lastIndexOf('#');
    return fragmentIndex < 0 ? href : href.substring(0, fragmentIndex);
}

class NavMapBuilder {

    constructor (epubBuilder) {
        this.epubBuilder = epubBuilder;
    }

    build (items) {
        this.checkItems(items);
        this.result = ['navMap'];
        this.counter = 1;
        this.maxDepth = 0;
        forEach(items, (item) => this.result.push(this.buildNavPoint(item)));
    }

    buildNavPoint ([{ label, href }, ...children], level = 1) {
        if (this.maxDepth < level) {
            this.maxDepth = level;
        }
        const navPoint = [
            'navPoint',
            { id: `ncx-${FORMATTER.format(this.counter)}`, playOrder: `${this.counter}` },
            ['navLabel', ['text', label]],
            ['content', { src: href }]
        ];
        this.counter++;
        forEach(children, (child) => navPoint.push(this.buildNavPoint(child, level + 1)));
        return navPoint;
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

module.exports = NavMapBuilder;
