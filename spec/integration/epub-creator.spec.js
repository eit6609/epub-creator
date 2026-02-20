'use strict';

const
    EPUBCreator = require('../../src/epub-creator.js'),
    JSZip = require('jszip'),
    { walkAsync } = require('@eit6609/walker'),
    { join } = require('path'),
    { promisify } = require('util'),
    { close, open, read, readFile, unlink } = require('fs'),
    Promise = require('bluebird');

const
    closePromise = promisify(close),
    openPromise = promisify(open),
    readPromise = promisify(read),
    readFilePromise = promisify(readFile),
    unlinkPromise = promisify(unlink);

async function loadZip (fileName) {
    const buffer = await readFilePromise(fileName);
    return JSZip.loadAsync(buffer);
}

async function readMimeType (fileName) {
    const position = 30;
    const bufSize = 28;
    const buffer = Buffer.alloc(bufSize);
    const fd = await openPromise(fileName, 'r');
    await readPromise(fd, buffer, 0, bufSize, position);
    await closePromise(fd);
    return buffer.toString('ascii');
}

async function compareEntryWithFile (zip, entryName, fileName) {
    const entry = zip.file(entryName);
    const entryContent = await entry.async('nodebuffer');
    const fileContent = await readFilePromise(fileName);
    if (!entryContent.equals(fileContent)) {
        fail(`Entry ${entry.name} and file ${fileName} have different content`);
    }
}

describe('EPUBCreator', () => {

    afterEach(async () => {
        unlinkPromise('spec/fixtures/temp/result.epub');
    });

    describe('build()', () => {
        it('should create the expected epub', async () => {
            const options = {
                contentDir: 'spec/fixtures/content',
                spine: ['text/front.xhtml', 'text/001.xhtml', 'text/002.xhtml'],
                toc: [
                    [{ label: 'Front Matter', href: 'text/front.xhtml' }],
                    [{ label: 'Chapter One', href: 'text/001.xhtml' }],
                    [{ label: 'Chapter Two', href: 'text/002.xhtml' }]
                ],
                cover: 'images/010.jpg',
                simpleMetadata: {
                    title: 'Test ePUB',
                    author: 'epub-creator integration spec'
                },
                metadata: [
                    ['dc:date', '2000-01-01T00:00:00.000Z'],
                    ['dc:identifier', { id: 'BookId', 'opf:scheme': 'UUID' }, 'test-identifier']
                ]
            };
            const fileName = 'spec/fixtures/temp/result.epub';
            const sut = new EPUBCreator(options);
            await sut.create(fileName);
            const mimeType = await readMimeType(fileName);
            expect(mimeType).toBe('mimetypeapplication/epub+zip');
            const zip = await loadZip(fileName);
            await compareEntryWithFile(zip, 'META-INF/container.xml', 'spec/fixtures/container.xml');
            await compareEntryWithFile(zip, 'OEBPS/content.opf', 'spec/fixtures/content.opf');
            await compareEntryWithFile(zip, 'OEBPS/toc.ncx', 'spec/fixtures/toc.ncx');
            await compareEntryWithFile(zip, 'OEBPS/cover-page.html', 'spec/fixtures/cover-page.html');
            for (const promise of walkAsync('spec/fixtures/content')) {
                const [dirPath, , fileNames] = await promise;
                await Promise.each(fileNames, async (fileName) => {
                    const filePath = join(dirPath, fileName);
                    const archivePath = join('OEBPS', filePath.substring(options.contentDir.length + 1));
                    await compareEntryWithFile(zip, archivePath, filePath);
                });
            }
        });
    });
});
