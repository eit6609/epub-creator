'use strict';

const
    { cloneDeep, find, forEach, isUndefined } = require('lodash'),
    { readFile, writeFile } = require('fs'),
    { JSMLSerializer, JSMLUtils: { getChildren, validateJSML, xmlDeclaration, docType } } = require('@eit6609/jsml'),
    { walkAsync } = require('@eit6609/walker'),
    { join } = require('path'),
    { inspect, promisify } = require('util'),
    NavMapBuilder = require('./navmap-builder.js'),
    Joi = require('@hapi/joi'),
    JSZip = require('jszip'),
    Promise = require('bluebird'),
    uuid = require('uuid');

const
    readFilePromise = promisify(readFile),
    writeFilePromise = promisify(writeFile);

const
    DOCUMENT = '!DOCUMENT',
    XML_DECLARATION = xmlDeclaration(),
    NCX_DOCTYPE =
        docType('ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd"'),
    HTML_DOCTYPE =
        docType('html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"'),
    METADATA_ATTRIBUTES =
        { 'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:opf': 'http://www.idpf.org/2007/opf' },
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

const
    FORMATTER = new Intl.NumberFormat('en', { minimumIntegerDigits: 6, useGrouping: false });

const optionsSchema = Joi.object({
    contentDir: Joi.string().required(),
    metadata: Joi.array(),
    simpleMetadata: Joi.object({
        title: Joi.string(),
        author: Joi.string(),
        language: Joi.string()
    }),
    spine: Joi.array().items(Joi.string()).unique().required(),
    toc: Joi.array().required(),
    cover: Joi.string()
});

function getElementTextByName (name, jsml) {
    const element = find(jsml, ([tag]) => tag === name);
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

    constructor (options, mockSchema) {
        if (!mockSchema) {
            this.checkOptions(options, mockSchema);
        }
        this.contentDir = options.contentDir;
        this.spine = options.spine;
        this.toc = options.toc;
        this.metadata = this.prepareMetadata(options.metadata, options.simpleMetadata);
        this.cover = options.cover;
        this.fileName2id = new Map();
    }

    checkOptions (options, mockSchema) {
        const { error } = (mockSchema || optionsSchema).validate(options);
        if (error) {
            error.message = `Invalid options ${inspect(options)}: ${error.message}`;
            throw error;
        }
    }

    // eslint-disable-next-line max-statements
    prepareMetadata (metadata = [], simpleMetadata = {}) {
        validateJSML(['metadata', ...metadata]);
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
        return metadata;
    }

    getFromMetadata (elementName) {
        return getElementTextByName(elementName, this.metadata);
    }

    getFileId (name) {
        const id = this.fileName2id.get(name);
        if (isUndefined(id)) {
            throw new Error(`File not found in manifest: "${name}"`);
        }
        return id;
    }

    buildContainer () {
        return [
            DOCUMENT,
            XML_DECLARATION,
            [
                'container',
                { version: '1.0', xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container' },
                [
                    'rootfiles',
                    [
                        'rootfile',
                        { 'full-path': `${CONTENT_DIR}/${CONTENT_FILENAME}`, 'media-type': CONTENT_MEDIA_TYPE }
                    ]
                ]
            ]
        ];
    }

    async buildManifest (walk) {
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
        walk = walk || walkAsync;
        for (const promise of walk(this.contentDir)) {
            const [dirPath, , fileNames] = await promise;
            forEach(fileNames, (fileName) => {
                const id = `id-${FORMATTER.format(counter++)}`;
                const href = join(dirPath, fileName).substring(this.contentDir.length + 1);
                this.fileName2id.set(href, id);
                manifest.push(['item', { id, href, 'media-type': EPUBCreator.getMediaTypeFromFilename(fileName) }]);
            });
        }
        return manifest;
    }

    buildContent (manifest) {
        const metadata = this.buildMetadata();
        const spine = this.buildSpine();
        return [
            DOCUMENT,
            XML_DECLARATION,
            [
                'package',
                {
                    'version': '2.0',
                    'xmlns': 'http://www.idpf.org/2007/opf',
                    'unique-identifier': 'BookId'
                },
                metadata,
                manifest,
                spine
            ]
        ];
    }

    buildMetadata () {
        const metadata = ['metadata', METADATA_ATTRIBUTES, ...cloneDeep(this.metadata)];
        if (this.cover) {
            metadata.push(['meta', { name: 'cover', content: this.getFileId(this.cover) }]);
        }
        return metadata;
    }

    buildSpine () {
        const spine = ['spine', { 'toc': TOC_ID }];
        if (this.cover) {
            spine.push(['itemref', { 'idref': COVER_PAGE_ID }]);
        }
        forEach(this.spine, (fileName) => spine.push(['itemref', { 'idref': this.getFileId(fileName) }]));
        return spine;
    }

    buildTOC (navMapBuilder) {
        navMapBuilder = navMapBuilder || new NavMapBuilder(this);
        navMapBuilder.build(this.toc);
        return [
            DOCUMENT,
            XML_DECLARATION,
            NCX_DOCTYPE,
            [
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
            ]
        ];
    }

    buildCoverPage () {
        if (!EPUBCreator.getMediaTypeFromFilename(this.cover).startsWith('image/')) {
            throw new Error(`Cover file "${this.cover}" is not an image`);
        }
        return [
            DOCUMENT,
            XML_DECLARATION,
            HTML_DOCTYPE,
            [
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
            ]
        ];
    }

    async buildZip (container, content, toc, coverPage, walk, zip, readFile) {
        walk = walk || walkAsync;
        zip = zip || new JSZip();
        readFile = readFile || readFilePromise;
        zip.file(MIMETYPE_FILENAME, EPUB_MIMETYPE, { compression: 'STORE' });
        zip.file(CONTAINER_FILENAME, container);
        zip.file(join(CONTENT_DIR, CONTENT_FILENAME), content);
        zip.file(join(CONTENT_DIR, TOC_FILENAME), toc);
        if (coverPage) {
            zip.file(join(CONTENT_DIR, COVER_PAGE_FILENAME), coverPage);
        }
        for (const promise of walk(this.contentDir)) {
            const [dirPath, , fileNames] = await promise;
            await Promise.each(fileNames, async (fileName) => {
                const filePath = join(dirPath, fileName);
                const archivePath = join(CONTENT_DIR, filePath.substring(this.contentDir.length + 1));
                zip.file(archivePath, await readFile(filePath));
            });
        }
        return zip;
    }

    async saveZip (zip, fileName, mockWriteFilePromise) {
        const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        return (mockWriteFilePromise || writeFilePromise)(fileName, buffer);
    }

    async create (fileName) {
        const manifest = await this.buildManifest();
        const serializer = new JSMLSerializer({ spacesPerLevel: 4 });
        const container = serializer.serialize(this.buildContainer());
        const content = serializer.serialize(this.buildContent(manifest));
        const toc = serializer.serialize(this.buildTOC());
        const coverPage = this.cover ? serializer.serialize(this.buildCoverPage()) : undefined;
        const zip = await this.buildZip(container, content, toc, coverPage);
        return this.saveZip(zip, fileName);
    }

}

module.exports = EPUBCreator;
