'use strict';

const
    EPUBCreator = require('../../src/epub-creator.js'),
    Promise = require('bluebird'),
    { JSMLUtils: { xmlDeclaration, docType } } = require('@eit6609/jsml');

describe('EPUBCreator', () => {

    let sut;

    describe('static getMediaTypeFromFilename()', () => {
        it('should return `application/xhtml+xml` for a name ending with `.html`', () => {
            expect(EPUBCreator.getMediaTypeFromFilename('page.html')).toBe('application/xhtml+xml');
        });
        it('should return `application/xhtml+xml` for a name ending with `.xhtml`', () => {
            expect(EPUBCreator.getMediaTypeFromFilename('page.xhtml')).toBe('application/xhtml+xml');
        });
        it('should return `image/png` for a name ending with `.png`', () => {
            expect(EPUBCreator.getMediaTypeFromFilename('image.png')).toBe('image/png');
        });
        it('should return `image/gif` for a name ending with `.gif`', () => {
            expect(EPUBCreator.getMediaTypeFromFilename('image.gif')).toBe('image/gif');
        });
        it('should return `image/jpeg` for a name ending with `.jpg`', () => {
            expect(EPUBCreator.getMediaTypeFromFilename('image.jpg')).toBe('image/jpeg');
        });
        it('should return `image/svg+xml` for a name ending with `.svg`', () => {
            expect(EPUBCreator.getMediaTypeFromFilename('image.svg')).toBe('image/svg+xml');
        });
        it('should return `text/css` for a name ending with `.css`', () => {
            expect(EPUBCreator.getMediaTypeFromFilename('stylesheet.css')).toBe('text/css');
        });
        it('should throw if it cannot guess the media type', () => {
            try {
                EPUBCreator.getMediaTypeFromFilename('spreadsheet.xls');
            } catch (error) {
                expect(error.message).toBe('Can\'t guess media type of file "spreadsheet.xls"');
            }
        });
    });

    describe('constructor()', () => {
        it('should check and store the options', () => {
            const options = {
                contentDir: 'a-content-dir',
                spine: 'a-spine',
                toc: 'a-toc',
                metadata: 'a-metadata',
                simpleMetadata: 'a-simple-metadata',
                cover: 'a-cover'
            };
            spyOn(EPUBCreator.prototype, 'checkOptions');
            spyOn(EPUBCreator.prototype, 'prepareMetadata').and.returnValue('metadata');
            sut = new EPUBCreator(options);
            expect(sut.contentDir).toBe('a-content-dir');
            expect(sut.spine).toBe('a-spine');
            expect(sut.toc).toBe('a-toc');
            expect(sut.metadata).toBe('metadata');
            expect(sut.cover).toBe('a-cover');
            expect(sut.fileName2id).toEqual(new Map());
            expect(sut.checkOptions).toHaveBeenCalledWith(options, undefined);
            expect(sut.prepareMetadata).toHaveBeenCalledWith(options.metadata, options.simpleMetadata);
        });
    });

    describe('checkOptions()', () => {
        it('should check the options calling validate() on the schema', () => {
            const mockSchema = {
                validate () {
                }
            };
            sut = new EPUBCreator({}, mockSchema);
            spyOn(mockSchema, 'validate').and.returnValue({});
            sut.checkOptions('options', mockSchema);
            expect(mockSchema.validate).toHaveBeenCalledWith('options');
        });
        it('should throw the error returned by validate()', () => {
            const mockSchema = {
                validate () {
                }
            };
            sut = new EPUBCreator({}, mockSchema);
            spyOn(mockSchema, 'validate').and.returnValue({ error: new Error('a maessage') });
            try {
                sut.checkOptions('options', mockSchema);
            } catch (error) {
                expect(error.message).toBe('Invalid options \'options\': a maessage');
            }
        });
    });

    describe('prepareMetadata()', () => {
        it('should return the default metadata if called with no parameters', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            const result = sut.prepareMetadata();
            expect(result).toBeArray();
            expect(result.length).toBe(4);
            expect(result[0][2])
                .toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            expect(result[1][1]).toBeIso8601();
            expect(result).toEqual([
                ['dc:identifier', { 'id': 'BookId', 'opf:scheme': 'UUID' }, result[0][2]],
                ['dc:date', result[1][1]],
                ['dc:language', 'en'],
                ['dc:title', 'Untitled']
            ]);
        });
        it('should copy the simple metadata to the metadata if needed', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            const simpleMetadata = {
                author: 'E. A. Poe',
                title: 'The Purloined Letter',
                language: 'en_US',
                description: '<p>A good tale.</p>',
                tags: ['Fiction', 'Thriller'],
                isbn: '1234567890'
            };
            const result = sut.prepareMetadata([], simpleMetadata);
            expect(result).toEqual([
                ['dc:identifier', { 'id': 'BookId', 'opf:scheme': 'UUID' }, result[0][2]],
                ['dc:identifier', { 'opf:scheme': 'ISBN' }, '1234567890'],
                ['dc:date', result[2][1]],
                ['dc:language', 'en_US'],
                ['dc:creator', { 'opf:role': 'aut' }, 'E. A. Poe'],
                ['dc:title', 'The Purloined Letter'],
                ['dc:description', '<p>A good tale.</p>'],
                ['dc:subject', 'Fiction'],
                ['dc:subject', 'Thriller'],
            ]);
        });
        it('should not copy the simple metadata to the metadata if not needed', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            const metadata = [
                ['dc:identifier', { 'opf:scheme': 'UUID' }, 'an-uuid'],
                ['dc:identifier', { 'opf:scheme': 'ISBN' }, 'an-isbn'],
                ['dc:date', 'a-date'],
                ['dc:language', 'a-language'],
                ['dc:title', 'a-title'],
                ['dc:creator', 'a-creator'],
                ['dc:description', 'a-description'],
                ['dc:subject', 'a-subject']
            ];
            const simpleMetadata = {
                author: 'E. A. Poe',
                title: 'The Purloined Letter',
                language: 'en_US',
                description: '<p>A good tale.</p>',
                tags: ['Fiction', 'Thriller'],
                isbn: '1234567890'
            };
            const result = sut.prepareMetadata(metadata, simpleMetadata);
            console.log(result);
            expect(result).toEqual([
                ['dc:identifier', { 'opf:scheme': 'UUID', id: 'BookId' }, 'an-uuid'],
                ['dc:identifier', { 'opf:scheme': 'ISBN' }, 'an-isbn'],
                ['dc:date', 'a-date'],
                ['dc:language', 'a-language'],
                ['dc:title', 'a-title'],
                ['dc:creator', 'a-creator'],
                ['dc:description', 'a-description'],
                ['dc:subject', 'a-subject'],
                // ['dc:identifier', { 'id': 'BookId', 'opf:scheme': 'UUID' }, result[7][2]]
            ]);
        });
        it('should throw if the metadata is not valid JSML', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            const metadata = [1];
            try {
                sut.prepareMetadata(metadata);
                fail();
            } catch (error) {
                expect(error.message).toBe('Invalid JSML: 1 is neither an array nor a string');
            }
        });
    });

    describe('getFromMetadata()', () => {
        it('should return undefined if the element was not found in the metadata', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            expect(sut.getFromMetadata('dc:no')).toBeUndefined();
        });
        it('should return the first child of the element if it was found in the metadata', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            expect(sut.getFromMetadata('dc:title')).toBe('Untitled');
        });
    });

    describe('getUniqueIdFromMetadata()', () => {
        it('should return the opf:identifier element with UUID opf:schema in the metadata', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            expect(sut.getUniqueIdFromMetadata()).toStartWith('urn:uuid:');
        });
    });

    describe('getFileId()', () => {
        it('should throw if the file name is not mapped', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            try {
                sut.getFileId('name');
            } catch (error) {
                expect(error.message).toBe('File not found in manifest: "name"');
            }
        });
        it('should return the mapped id', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            sut.fileName2id.set('name', 'id-of-name');
            expect(sut.getFileId('name')).toBe('id-of-name');
        });
    });

    describe('buildContainer()', () => {
        it('should return the expected JSML', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            expect(sut.buildContainer()).toEqual([
                '!DOCUMENT',
                xmlDeclaration(),
                [
                    'container',
                    { version: '1.0', xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container' },
                    [
                        'rootfiles',
                        [
                            'rootfile',
                            { 'full-path': 'OEBPS/content.opf', 'media-type': 'application/oebps-package+xml' }
                        ]
                    ]
                ]
            ]);
        });
    });

    describe('buildContent()', () => {
        it('should return the expected JSML', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            spyOn(sut, 'buildMetadata').and.returnValue('metadata');
            spyOn(sut, 'buildSpine').and.returnValue('spine');
            expect(sut.buildContent('manifest')).toEqual([
                '!DOCUMENT',
                xmlDeclaration(),
                [
                    'package',
                    {
                        'version': '2.0',
                        'xmlns': 'http://www.idpf.org/2007/opf',
                        'unique-identifier': 'BookId'
                    },
                    'metadata',
                    'manifest',
                    'spine'
                ]
            ]);
        });
    });

    describe('buildMetadata()', () => {
        it('should return the expected JSML [when there is no cover]', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            sut.metadata = ['one', 'two'];
            expect(sut.buildMetadata()).toEqual([
                'metadata',
                { 'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:opf': 'http://www.idpf.org/2007/opf' },
                'one',
                'two'
            ]);
        });
        it('should return the expected JSML [when there is a cover]', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            sut.metadata = ['one', 'two'];
            sut.cover = 'cover.jpg';
            sut.fileName2id.set('cover.jpg', 'cover-id');
            expect(sut.buildMetadata()).toEqual([
                'metadata',
                { 'xmlns:dc': 'http://purl.org/dc/elements/1.1/', 'xmlns:opf': 'http://www.idpf.org/2007/opf' },
                'one',
                'two',
                ['meta', { name: 'cover', content: 'cover-id' }]
            ]);
        });
    });

    describe('buildManifest()', () => {
        const walkerResult = [
            ['root', ['images', 'style'], ['001.html', '002.html', '003.xhtml' ]],
            ['root/images', [], ['001.jpg', '002.png', '003.svg', '004.gif' ]],
            ['root/style', [], ['default.css']],
        ];
        let walkArg;
        function *walk (dir) {
            walkArg = dir;
            for (let i = 0; i < walkerResult.length; i++) {
                yield Promise.resolve(walkerResult[i]);
            }
        }
        it('should return the expected JSML [when there is no cover]', async () => {
            const mockSchema = true;
            sut = new EPUBCreator({ contentDir: 'root' }, mockSchema);
            spyOn(EPUBCreator, 'getMediaTypeFromFilename').and.callFake((href) => `media-type of ${href}`);
            expect(await sut.buildManifest(walk)).toEqual([
                'manifest',
                ['item', { id: 'id-toc', href: 'toc.ncx', 'media-type': 'application/x-dtbncx+xml' }],
                ['item', { id: 'id-000001', href: '001.html', 'media-type': 'media-type of 001.html' }],
                ['item', { id: 'id-000002', href: '002.html', 'media-type': 'media-type of 002.html' }],
                ['item', { id: 'id-000003', href: '003.xhtml', 'media-type': 'media-type of 003.xhtml' }],
                ['item', { id: 'id-000004', href: 'images/001.jpg', 'media-type': 'media-type of 001.jpg' }],
                ['item', { id: 'id-000005', href: 'images/002.png', 'media-type': 'media-type of 002.png' }],
                ['item', { id: 'id-000006', href: 'images/003.svg', 'media-type': 'media-type of 003.svg' }],
                ['item', { id: 'id-000007', href: 'images/004.gif', 'media-type': 'media-type of 004.gif' }],
                ['item', { id: 'id-000008', href: 'style/default.css', 'media-type': 'media-type of default.css' }],
            ]);
            expect(walkArg).toBe('root');
        });
        it('should return the expected JSML [when there is a cover]', async () => {
            const mockSchema = true;
            sut = new EPUBCreator({ contentDir: 'root', cover: 'cover.jsp' }, mockSchema);
            spyOn(EPUBCreator, 'getMediaTypeFromFilename').and.callFake((href) => `media-type of ${href}`);
            expect(await sut.buildManifest(walk)).toEqual([
                'manifest',
                ['item', { id: 'id-toc', href: 'toc.ncx', 'media-type': 'application/x-dtbncx+xml' }],
                ['item', { id: 'id-cover', href: 'cover-page.html', 'media-type': 'application/xhtml+xml' }],
                ['item', { id: 'id-000001', href: '001.html', 'media-type': 'media-type of 001.html' }],
                ['item', { id: 'id-000002', href: '002.html', 'media-type': 'media-type of 002.html' }],
                ['item', { id: 'id-000003', href: '003.xhtml', 'media-type': 'media-type of 003.xhtml' }],
                ['item', { id: 'id-000004', href: 'images/001.jpg', 'media-type': 'media-type of 001.jpg' }],
                ['item', { id: 'id-000005', href: 'images/002.png', 'media-type': 'media-type of 002.png' }],
                ['item', { id: 'id-000006', href: 'images/003.svg', 'media-type': 'media-type of 003.svg' }],
                ['item', { id: 'id-000007', href: 'images/004.gif', 'media-type': 'media-type of 004.gif' }],
                ['item', { id: 'id-000008', href: 'style/default.css', 'media-type': 'media-type of default.css' }],
            ]);
            expect(walkArg).toBe('root');
        });
    });

    describe('buildSpine()', () => {
        it('should return the expected JSML [when there is no cover]', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            sut.spine = ['1', '2', '3'];
            sut.fileName2id.set('1', 'id-1');
            sut.fileName2id.set('2', 'id-2');
            sut.fileName2id.set('3', 'id-3');
            expect(sut.buildSpine()).toEqual([
                'spine',
                { 'toc': 'id-toc' },
                ['itemref', { idref: 'id-1' } ],
                ['itemref', { idref: 'id-2' } ],
                ['itemref', { idref: 'id-3' } ],
            ]);
        });
        it('should return the expected JSML [when there is a cover]', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            sut.cover = 'cover.jpg';
            sut.spine = ['1', '2', '3'];
            sut.fileName2id.set('1', 'id-1');
            sut.fileName2id.set('2', 'id-2');
            sut.fileName2id.set('3', 'id-3');
            expect(sut.buildSpine()).toEqual([
                'spine',
                { 'toc': 'id-toc' },
                ['itemref', { 'idref': 'id-cover' }],
                ['itemref', { idref: 'id-1' } ],
                ['itemref', { idref: 'id-2' } ],
                ['itemref', { idref: 'id-3' } ],
            ]);
        });
    });

    describe('buildTOC()', () => {
        it('should return the expected JSML using the results of the NavMapBuilder', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            console.log(sut.metadata);
            const navMapBuilder = {
                build () {
                },
                result: 'result',
                maxDepth: 'maxDepth'
            };
            expect(sut.buildTOC(navMapBuilder)).toEqual([
                '!DOCUMENT',
                xmlDeclaration(),
                docType('ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd"'),
                [
                    'ncx',
                    { 'xmlns': 'http://www.daisy.org/z3986/2005/ncx/', 'version': '2005-1' },
                    [
                        'head',
                        ['meta', { 'name': 'dtb:uid', 'content': sut.metadata[0][2] }],
                        ['meta', { 'name': 'dtb:depth', 'content': 'maxDepth' }],
                        ['meta', { 'name': 'dtb:totalPageCount', 'content': '0' }],
                        ['meta', { 'name': 'dtb:maxPageNumber', 'content': '0' }]
                    ],
                    ['docTitle', ['text', 'Untitled']],
                    'result'
                ]
            ]);
        });
    });

    describe('buildCoverPage()', () => {
        it('should throw if the cover is not an image', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            sut.cover = 'cover.html';
            try {
                sut.buildCoverPage();
            } catch (error) {
                expect(error.message).toBe('Cover file "cover.html" is not an image');
            }
        });
        it('should return the expected JSML', () => {
            const mockSchema = true;
            sut = new EPUBCreator({}, mockSchema);
            sut.metadata = [['dc:title', 'Title']];
            sut.cover = 'cover.jpg';
            expect(sut.buildCoverPage()).toEqual([
                '!DOCUMENT',
                xmlDeclaration(),
                docType('html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"'),
                [
                    'html',
                    { xmlns: 'http://www.w3.org/1999/xhtml' },
                    [
                        'head',
                        ['title', 'Title']
                    ],
                    [
                        'body',
                        [
                            'div',
                            { style: 'text-align:center;height:100%;' },
                            [
                                'img',
                                {
                                    alt: 'Cover for "Title"',
                                    src: 'cover.jpg',
                                    style: 'max-width:100%;height:100%;'
                                }
                            ]
                        ]
                    ]
                ]
            ]);
        });
    });

    describe('buildZip', () => {
        it('should call the expected methods with the expected params on the zip builder and return it [when ' +
            'there is no cover]', async () => {
            const container = 'container';
            const content = 'content';
            const toc = 'toc';
            let walkArg;
            const walkerResult = [
                ['root', ['images', 'style'], ['001.html', '002.html', '003.xhtml' ]],
                ['root/images', [], ['001.jpg', '002.png', '003.svg', '004.gif' ]],
                ['root/style', [], ['default.css']],
            ];
            function *walk (dir) {
                walkArg = dir;
                for (let i = 0; i < walkerResult.length; i++) {
                    yield Promise.resolve(walkerResult[i]);
                }
            }
            const zip = {
                file () {
                }
            };
            async function readFile (name) {
                return `content of ${name}`;
            }
            spyOn(zip, 'file');
            const mockSchema = true;
            sut = new EPUBCreator({ contentDir: 'root' }, mockSchema);
            expect(await sut.buildZip(container, content, toc, undefined, walk, zip, readFile)).toBe(zip);
            expect(walkArg).toBe('root');
            expect(zip.file).toHaveBeenCalledWith('mimetype', 'application/epub+zip', { compression: 'STORE' });
            expect(zip.file).toHaveBeenCalledWith('META-INF/container.xml', container);
            expect(zip.file).toHaveBeenCalledWith('OEBPS/content.opf', content);
            expect(zip.file).toHaveBeenCalledWith('OEBPS/toc.ncx', toc);
            expect(zip.file).toHaveBeenCalledWith('OEBPS/001.html', 'content of root/001.html');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/002.html', 'content of root/002.html');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/003.xhtml', 'content of root/003.xhtml');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/001.jpg', 'content of root/images/001.jpg');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/002.png', 'content of root/images/002.png');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/003.svg', 'content of root/images/003.svg');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/004.gif', 'content of root/images/004.gif');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/style/default.css', 'content of root/style/default.css');
        });
        it('should call the expected methods with the expected params on the zip builder and return it [when ' +
            'there is a cover]', async () => {
            const container = 'container';
            const content = 'content';
            const toc = 'toc';
            const coverPage = 'coverPage';
            let walkArg;
            const walkerResult = [
                ['root', ['images', 'style'], ['001.html', '002.html', '003.xhtml' ]],
                ['root/images', [], ['001.jpg', '002.png', '003.svg', '004.gif' ]],
                ['root/style', [], ['default.css']],
            ];
            function *walk (dir) {
                walkArg = dir;
                for (let i = 0; i < walkerResult.length; i++) {
                    yield Promise.resolve(walkerResult[i]);
                }
            }
            const zip = {
                file () {
                }
            };
            async function readFile (name) {
                return `content of ${name}`;
            }
            spyOn(zip, 'file');
            const mockSchema = true;
            sut = new EPUBCreator({ contentDir: 'root', cover: 'cover.png' }, mockSchema);
            expect(await sut.buildZip(container, content, toc, coverPage, walk, zip, readFile)).toBe(zip);
            expect(walkArg).toBe('root');
            expect(zip.file).toHaveBeenCalledWith('mimetype', 'application/epub+zip', { compression: 'STORE' });
            expect(zip.file).toHaveBeenCalledWith('META-INF/container.xml', container);
            expect(zip.file).toHaveBeenCalledWith('OEBPS/content.opf', content);
            expect(zip.file).toHaveBeenCalledWith('OEBPS/toc.ncx', toc);
            expect(zip.file).toHaveBeenCalledWith('OEBPS/cover-page.html', coverPage);
            expect(zip.file).toHaveBeenCalledWith('OEBPS/001.html', 'content of root/001.html');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/002.html', 'content of root/002.html');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/003.xhtml', 'content of root/003.xhtml');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/001.jpg', 'content of root/images/001.jpg');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/002.png', 'content of root/images/002.png');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/003.svg', 'content of root/images/003.svg');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/images/004.gif', 'content of root/images/004.gif');
            expect(zip.file).toHaveBeenCalledWith('OEBPS/style/default.css', 'content of root/style/default.css');
        });
    });
    /*
    describe('saveZip()', () => {
        it('should return a Promise and should call the expected methods to build it', () => {
            const stream = {
                pipe () {
                },
                on () {
                }
            };
            const zip = {
                generateNodeStream () {
                }
            };
            const fileName = 'name';
            const writeStream = 'stream';
            let writeStreamName;
            function createWriteStream (name) {
                writeStreamName = name;
                return writeStream;
            }
            spyOn(stream, 'pipe').and.returnValue(stream);
            spyOn(stream, 'on').and.returnValue(stream);
            spyOn(zip, 'generateNodeStream').and.returnValue(stream);
            const mockSchema = true;
            const sut = new EPUBCreator({ contentDir: 'root' }, mockSchema);
            const result = sut.saveZip(zip, fileName, createWriteStream);
            expect(result).toEqual(jasmine.any(Promise));
            expect(zip.generateNodeStream)
                .toHaveBeenCalledWith({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' });
            expect(writeStreamName).toBe(fileName);
            expect(stream.pipe).toHaveBeenCalledWith(writeStream);
            expect(stream.on).toHaveBeenCalledWith('finish', jasmine.any(Function));
            expect(stream.on).toHaveBeenCalledWith('error', jasmine.any(Function));
        });
    });
    */

    describe('saveZip()', () => {
        it('should call zip.generateAsync() and pass the generated buffer to writeFilePromise()', async () => {
            const zip = {
                async generateAsync () {
                }
            };
            const fileName = 'name';
            const buffer = 'buffer';
            let expectedFileName;
            let expectedData;
            async function mockWriteFilePromise (name, data) {
                expectedFileName = name;
                expectedData = data;
            }
            spyOn(zip, 'generateAsync').and.returnValue(buffer);
            const mockSchema = true;
            const sut = new EPUBCreator({ contentDir: 'root' }, mockSchema);
            await sut.saveZip(zip, fileName, mockWriteFilePromise);
            expect(zip.generateAsync).toHaveBeenCalledWith({ type: 'nodebuffer', compression: 'DEFLATE' });
            expect(expectedFileName).toBe(fileName);
            expect(expectedData).toBe(buffer);
        });
    });

    describe('create()', () => {
        it('should call the expected methods to build the epub and then return the result of saveZip() ' +
            '[when there is no cover]', async () => {
            const mockSchema = true;
            const sut = new EPUBCreator({}, mockSchema);
            spyOn(sut, 'buildManifest').and.returnValue('manifest');
            spyOn(sut, 'buildContainer').and.returnValue(['container']);
            spyOn(sut, 'buildContent').and.returnValue(['content']);
            spyOn(sut, 'buildTOC').and.returnValue(['toc']);
            spyOn(sut, 'buildZip').and.returnValue('zip');
            spyOn(sut, 'saveZip').and.returnValue('done');
            const result = await sut.create('name');
            expect(result).toBe('done');
            expect(sut.buildManifest).toHaveBeenCalledWith();
            expect(sut.buildContainer).toHaveBeenCalledWith();
            expect(sut.buildContent).toHaveBeenCalledWith('manifest');
            expect(sut.buildTOC).toHaveBeenCalledWith();
            expect(sut.buildZip).toHaveBeenCalledWith('<container />', '<content />', '<toc />', undefined);
            expect(sut.saveZip).toHaveBeenCalledWith('zip', 'name');
        });
        it('should call the expected methods to build the epub and then return the result of saveZip() ' +
            '[when there is a cover]', async () => {
            const mockSchema = true;
            const sut = new EPUBCreator({ cover: 'cover.jpg' }, mockSchema);
            spyOn(sut, 'buildManifest').and.returnValue('manifest');
            spyOn(sut, 'buildContainer').and.returnValue(['container']);
            spyOn(sut, 'buildContent').and.returnValue(['content']);
            spyOn(sut, 'buildTOC').and.returnValue(['toc']);
            spyOn(sut, 'buildCoverPage').and.returnValue(['cover']);
            spyOn(sut, 'buildZip').and.returnValue('zip');
            spyOn(sut, 'saveZip').and.returnValue('done');
            const result = await sut.create('name');
            expect(result).toBe('done');
            expect(sut.buildManifest).toHaveBeenCalledWith();
            expect(sut.buildContainer).toHaveBeenCalledWith();
            expect(sut.buildContent).toHaveBeenCalledWith('manifest');
            expect(sut.buildTOC).toHaveBeenCalledWith();
            expect(sut.buildCoverPage).toHaveBeenCalledWith();
            expect(sut.buildZip).toHaveBeenCalledWith('<container />', '<content />', '<toc />', '<cover />');
            expect(sut.saveZip).toHaveBeenCalledWith('zip', 'name');
        });
    });

});
