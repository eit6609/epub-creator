'use strict';

const
    { cloneDeep, difference, filter, find, forEach, isUndefined } = require('lodash'),
    { createWriteStream, readFileSync, readdirSync, statSync } = require('fs'),
    { JSMLSerializer, JSMLUtils: { getChildren, validate } } = require('@eit6609/jsml'),
    { join } = require('path'),
    Joi = require('@hapi/joi'),
    JSZip = require('jszip'),
    uuid = require('uuid');

const
    METADATA_ATTRIBUTES =
        { 'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:opf': 'http://www.idpf.org/2007/opf' },
    TOC_DOCTYPE =
        '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">',
    XHTML_DOCTYPE =
        '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
    EPUB_MIMETYPE = 'application/epub+zip',
    TOC_MEDIA_TYPE = 'application/x-dtbncx+xml',
    CONTENT_MEDIA_TYPE = 'application/oebps-package+xml',
    CONTAINER_FILENAME = 'META-INF/container.xml',
    MIMETYPE_FILENAME = 'mimetype';

const
    CONTENT_DIR = 'OEBPS',
    TOC_FILENAME = 'toc.ncx',
    TOC_ID = 'id-toc',
    CONTENT_FILENAME = 'content.opf',
    COVER_PAGE_FILENAME = 'cover-page.html',
    COVER_PAGE_ID = 'id-cover',
    COVER_PAGE_MEDIA_TYPE = 'application/xhtml+xml';

const
    DEFAULT_LANGUAGE = 'en',
    DEFAULT_TITLE = 'Untitled';

const FORMATTER = new Intl.NumberFormat('en', { minimumIntegerDigits: 6, useGrouping: false });

const metadataItemSchema = Joi.array();
const simpleMetadataSchema = Joi.object({
    title: Joi.string(),
    author: Joi.string(),
    language: Joi.string()
});
let tocItemSchema = Joi.object({
    label: Joi.string().required(),
    href: Joi.string().required(),
});
tocItemSchema = tocItemSchema.append({
    children: Joi.array().items(tocItemSchema)
});
const optionsSchema = Joi.object({
    contentDir: Joi.string().required(),
    metadata: Joi.array().items(metadataItemSchema),
    simpleMetadata: simpleMetadataSchema,
    spine: Joi.array().items(Joi.string()).unique().required(),
    toc: Joi.array().items(tocItemSchema).required(),
    cover: Joi.string()
});

/*
TOC, un albero di link
va tradotto nell'albero dei NavPoint, che è un JsonML
[{
    label: 'Part 1',
    href: 'part1.html'
    children: [{
        label: 'Chapter 1',
        href: 'chapter1.html'
    }, {
        label: 'Chapter 2',
        href: 'chapter2.html'
    }]
}, {
    label: 'Part 2',
    href: 'part1.html'
    children: [{
        label: 'Chapter 3',
        href: 'chapter1.html'
    }]
}]

METADATA, un JsonML
Siccome non c'è un formato unico per rappresentare un XML con un Object, cioè ogni parser/builder usa il suo, tanto
vale usare JsonML, che è un formato come gli altri.
*/

class NavMapBuilder {

    constructor (epubBuilder) {
        this.epubBuilder = epubBuilder;
    }

    build (items) {
        this.result = ['navMap'];
        this.counter = 1;
        this.maxDepth = 0;
        forEach(items, (item) => this.result.push(this.buildNavPoint(item)));
    }

    buildNavPoint (item, level = 1) {
        this.checkItem(item);
        if (this.maxDepth < level) {
            this.maxDepth = level;
        }
        const navPoint = [
            'navPoint',
            { id: `ncx-${FORMATTER.format(this.counter)}`, playOrder: `${this.counter}` },
            ['navLabel', ['text', item.label]],
            ['content', { src: item.href }]
        ];
        this.counter++;
        if (!isUndefined(item.children)) {
            forEach(item.children, (child) => navPoint.push(this.buildNavPoint(child, level++)));
        }
        return navPoint;
    }

    checkItem (item) {
        this.epubBuilder.getFileId(item.href);
    }

}

class FileSistemWalker {

    constructor (root) {
        this.root = root;
    }

    walk () {
        const result = [];
        this.walkRecursive(this.root, result);
        return result;
    }

    walkRecursive (dirpath, result) {
        const names = readdirSync(dirpath);
        const dirNames = filter(names, (name) => statSync(join(dirpath, name)).isDirectory());
        const fileNames = difference(names, dirNames);
        result.push([dirpath, dirNames, fileNames]);
        forEach(dirNames, (name) => this.walkRecursive(join(dirpath, name), result));
    }

}

function getElementTextByName (name, jsonml) {
    const element = find(jsonml, (element) => element[0] === name);
    if (isUndefined(element)) {
        return element;
    }
    return getChildren(element)[0];
}

class EPUBCreator {

    static getMediaTypeFromFilename (path) {
        const ext = path.substring(path.lastIndexOf('.') + 1);
        switch (ext) {
            case 'html':
            case 'xhtml':
                return 'application/xhtml+xml';
            case 'png':
                return 'image/png';
            case 'gif':
                return 'image/gif';
            case 'jpg':
                return 'image/jpeg';
            case 'svg':
                return 'image/svg+xml';
            case 'css':
                return 'text/css';
            default:
                throw new Error(`Can't guess media type of file "${path}"`);
        }
    }

    constructor (options) {
        this.checkOptions(options);
        this.contentDir = options.contentDir;
        this.spine = options.spine;
        this.toc = options.toc;
        this.metadata = this.prepareMetadata(options.metadata, options.simpleMetadata);
        this.cover = options.cover;
        this.fileName2id = new Map();
    }

    checkOptions (options) {
        const { error } = optionsSchema.validate(options);
        if (error) {
            throw error;
        }
    }

    // eslint-disable-next-line max-statements
    prepareMetadata (metadata = [], simpleMetadata = {}) {
        const extraElements = [];
        if (isUndefined(getElementTextByName('dc:identifier', metadata))) {
            extraElements.push(['dc:identifier', { 'id': 'BookId', 'opf:scheme': 'uuid' }, `urn:uuid:${uuid.v4()}`]);
        }
        if (isUndefined(getElementTextByName('dc:date', metadata))) {
            extraElements.push(['dc:date', new Date().toJSON()]);
        }
        if (isUndefined(getElementTextByName('dc:language', metadata))) {
            const language = simpleMetadata.language || DEFAULT_LANGUAGE;
            extraElements.push(['dc:language', language]);
        }
        if (isUndefined(getElementTextByName('dc:title', metadata))) {
            const title = simpleMetadata.title || DEFAULT_TITLE;
            extraElements.push(['dc:title', title]);
        }
        if (isUndefined(getElementTextByName('dc:creator', metadata)) && !isUndefined(simpleMetadata.author)) {
            extraElements.push(['dc:creator', { 'opf:role': 'aut' }, simpleMetadata.author]);
        }
        metadata = metadata.concat(extraElements);
        validate(['metadata', ...metadata]);
        return metadata;
    }

    getFromMetadata (elementName) {
        return getElementTextByName(elementName, this.metadata);
    }

    getFileId (name) {
        const id = this.fileName2id.get(name);
        if (isUndefined(id)) {
            throw new Error(`File not found in manifest: ${name}`);
        }
        return id;
    }

    buildContainer () {
        return [
            'container',
            { version: '1.0', xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container' },
            [
                'rootfiles',
                ['rootfile', { 'full-path': `${CONTENT_DIR}/${CONTENT_FILENAME}`, 'media-type': CONTENT_MEDIA_TYPE }]
            ]
        ];
    }

    buildContent () {
        // buildManifest() must be called first because it assigns ids to files, needed by buildMetadata(),
        // buildSpine() and buildTOC()
        const manifest = this.buildManifest();
        return [
            'package',
            {
                'version': '2.0',
                'xmlns': 'http://www.idpf.org/2007/opf',
                'unique-identifier': 'BookId'
            },
            this.buildMetadata(),
            manifest,
            this.buildSpine()
        ];
    }

    buildMetadata () {
        const metadata = ['metadata', METADATA_ATTRIBUTES, ...cloneDeep(this.metadata)];
        if (this.cover) {
            metadata.push(['meta', { name: 'cover', content: this.getFileId(this.cover) }]);
        }
        return metadata;
    }

    buildManifest () {
        const manifest = [
            'manifest',
            ['item', { 'id': TOC_ID, 'href': TOC_FILENAME, 'media-type': TOC_MEDIA_TYPE }],
        ];
        if (this.cover) {
            manifest.push(
                ['item', { 'id': COVER_PAGE_ID, 'href': COVER_PAGE_FILENAME, 'media-type': COVER_PAGE_MEDIA_TYPE }]
            );
        }
        let counter = 1;
        const walker = new FileSistemWalker(this.contentDir);
        forEach(walker.walk(), ([dirPath, , fileNames]) => {
            forEach(fileNames, (fileName) => {
                const id = `id-${FORMATTER.format(counter++)}`;
                const href = join(dirPath, fileName).substring(this.contentDir.length + 1);
                this.fileName2id.set(href, id);
                manifest.push(['item', { id, href, 'media-type': EPUBCreator.getMediaTypeFromFilename(fileName) }]);
            });
        });
        return manifest;
    }

    buildSpine () {
        const spine = ['spine', { 'toc': TOC_ID }];
        if (this.cover) {
            spine.push(['itemref', { 'idref': COVER_PAGE_ID }]);
        }
        forEach(this.spine, (fileName) => spine.push(['itemref', { 'idref': this.getFileId(fileName) }]));
        return spine;
    }

    buildTOC () {
        const navMapBuilder = new NavMapBuilder(this);
        navMapBuilder.build(this.toc);
        return [
            'ncx',
            { 'xmlns': 'http://www.daisy.org/z3986/2005/ncx/', 'version': '2005-1' },
            [
                'head',
                ['meta', { 'name': 'dtb:uid', 'content': this.getFromMetadata('dc:identifier') }],
                ['meta', { 'name': 'dtb:depth', 'content': `${navMapBuilder.maxDepth}` }],
                ['meta', { 'name': 'dtb:totalPageCount', 'content': '0' }],
                ['meta', { 'name': 'dtb:maxPageNumber', 'content': '0' }]
            ],
            ['docTitle', ['text', this.getFromMetadata('dc:title')]],
            navMapBuilder.result
        ];
    }

    buildCoverPage () {
        if (!EPUBCreator.getMediaTypeFromFilename(this.cover).startsWith('image/')) {
            throw new Error(`Cover file ${this.cover} is not an image`);
        }
        return [
            'html',
            { xmlns: 'http://www.w3.org/1999/xhtml' },
            [
                'head',
                ['title', this.getFromMetadata('dc:title')]
            ],
            [
                'body',
                [
                    'div',
                    { style: 'text-align:center;height:100%;' },
                    [
                        'img',
                        {
                            alt: `Cover for "${this.getFromMetadata('dc:title')}"`,
                            src: this.cover,
                            style: 'max-width:100%;height:100%;'
                        }
                    ]
                ]
            ]
        ];
    }

    buildZip (container, content, toc, coverPage) {
        const zip = new JSZip();
        zip.file(MIMETYPE_FILENAME, EPUB_MIMETYPE, { compression: 'STORE' });
        zip.file(CONTAINER_FILENAME, container);
        zip.file(join(CONTENT_DIR, CONTENT_FILENAME), content);
        zip.file(join(CONTENT_DIR, TOC_FILENAME), toc);
        if (coverPage) {
            zip.file(join(CONTENT_DIR, COVER_PAGE_FILENAME), coverPage);
        }
        const walker = new FileSistemWalker(this.contentDir);
        forEach(walker.walk(), ([dirPath, , fileNames]) => {
            forEach(fileNames, (fileName) => {
                const filePath = join(dirPath, fileName);
                const archivePath = join(CONTENT_DIR, filePath.substring(this.contentDir.length + 1));
                zip.file(archivePath, readFileSync(filePath));
            });
        });
        return zip;
    }

    saveZip (zip, fileName) {
        return new Promise((resolve, reject) => {
            zip
                .generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' })
                .pipe(createWriteStream(fileName))
                .on('finish', resolve)
                .on('error', reject);
        });
    }

    build (fileName) {
        const serializer = new JSMLSerializer({ appendDeclaration: true });
        const container = serializer.serialize(this.buildContainer());
        const content = serializer.serialize(this.buildContent());
        serializer.docType = TOC_DOCTYPE;
        const toc = serializer.serialize(this.buildTOC());
        serializer.docType = XHTML_DOCTYPE;
        const coverPage = this.cover ? serializer.serialize(this.buildCoverPage()) : undefined;
        const zip = this.buildZip(container, content, toc, coverPage);
        return this.saveZip(zip, fileName);
    }

}

module.exports = EPUBCreator;
