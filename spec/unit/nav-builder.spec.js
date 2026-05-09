'use strict';

const NavBuilder = require('../../src/nav-builder.js');

describe('NavBuilder', () => {

    let sut;
    let mockEpubBuilder;

    beforeEach(() => {
        mockEpubBuilder = {
            fileName2id: new Map(),
            getFileId (name) {
                const id = this.fileName2id.get(name);
                if (id === undefined) {
                    throw new Error(`File not found in manifest: "${name}"`);
                }
                return id;
            }
        };
        sut = new NavBuilder(mockEpubBuilder);
    });

    describe('build()', () => {
        it('should throw on invalid items [not an array]', () => {
            try {
                sut.build('not-an-array');
                fail('expected error');
            } catch (error) {
                expect(error.message).toContain('is not an array');
            }
        });
        it('should throw on invalid items [item not an array]', () => {
            try {
                sut.build(['not-an-array-item']);
                fail('expected error');
            } catch (error) {
                expect(error.message).toContain('is not an array');
            }
        });
        it('should throw on invalid items [missing href]', () => {
            try {
                sut.build([[{ label: 'Title' }]]);
                fail('expected error');
            } catch (error) {
                expect(error.message).toContain('"href" is required');
            }
        });
        it('should throw for files not in the manifest', () => {
            try {
                sut.build([[{ label: 'Chapter', href: 'chapter.xhtml' }]]);
                fail('expected error');
            } catch (error) {
                expect(error.message).toBe('File not found in manifest: "chapter.xhtml"');
            }
        });
        it('should handle an empty toc', () => {
            sut.build([]);
            expect(sut.result).toEqual(['ol']);
        });
        it('should handle a one-level toc', () => {
            mockEpubBuilder.fileName2id.set('1.xhtml', 'id-1');
            mockEpubBuilder.fileName2id.set('2.xhtml', 'id-2');
            sut.build([
                [{ label: 'Chapter 1', href: '1.xhtml' }],
                [{ label: 'Chapter 2', href: '2.xhtml' }]
            ]);
            expect(sut.result).toEqual([
                'ol',
                ['li', ['a', { href: '1.xhtml' }, 'Chapter 1']],
                ['li', ['a', { href: '2.xhtml' }, 'Chapter 2']]
            ]);
        });
        it('should handle a multi-level toc', () => {
            mockEpubBuilder.fileName2id.set('1.xhtml', 'id-1');
            mockEpubBuilder.fileName2id.set('2.xhtml', 'id-2');
            mockEpubBuilder.fileName2id.set('2.xhtml', 'id-2');
            sut.build([
                [{ label: 'Chapter 1', href: '1.xhtml' }],
                [{ label: 'Chapter 2', href: '2.xhtml' },
                    [{ label: 'Section 2.1', href: '2.xhtml#s1' }],
                    [{ label: 'Section 2.2', href: '2.xhtml#s2' }]]
            ]);
            expect(sut.result).toEqual([
                'ol',
                ['li', ['a', { href: '1.xhtml' }, 'Chapter 1']],
                ['li',
                    ['a', { href: '2.xhtml' }, 'Chapter 2'],
                    ['ol',
                        ['li', ['a', { href: '2.xhtml#s1' }, 'Section 2.1']],
                        ['li', ['a', { href: '2.xhtml#s2' }, 'Section 2.2']]
                    ]
                ]
            ]);
        });
    });

});
