'use strict';

const NavMapBuilder = require('../../src/navmap-builder.js');

describe('NavMapBuilder', () => {
    let epubBuilder, sut;

    beforeEach(() => {
        epubBuilder = {
            getFileId () {
            }
        };
        sut = new NavMapBuilder(epubBuilder);
    });

    describe('build()', () => {
        it('should throw on invalid items [1]', () => {
            const toc = 'hello';
            try {
                sut.build(toc);
                fail();
            } catch (error) {
                expect(error.message).toBe('Invalid TOC: \'hello\' is not an array');
            }
        });
        it('should throw on invalid items [2]', () => {
            const toc = ['hello'];
            try {
                sut.build(toc);
                fail();
            } catch (error) {
                expect(error.message).toBe('Invalid TOC item \'hello\': it is not an array');
            }
        });
        it('should throw on invalid items [3]', () => {
            const toc = [[{}]];
            try {
                sut.build(toc);
                fail();
            } catch (error) {
                expect(error.message).toBe('Invalid TOC item info {}: "label" is required');
            }
        });
        it('should throw on files not found', () => {
            spyOn(epubBuilder, 'getFileId').and.callFake((href) => {
                if (href === '2.html') {
                    throw new Error('a message');
                }
            });
            const toc = [
                [{ label: 'section 1', href: '1.html' }],
                [{ label: 'section 2', href: '2.html' }],
            ];
            try {
                sut.build(toc);
                fail();
            } catch (error) {
                expect(error.message).toBe('a message');
            }
        });
        it('should handle an empty toc', () => {
            const toc = [];
            sut.build(toc);
            expect(sut.result).toEqual(['navMap']);
            expect(sut.maxDepth).toBe(0);
        });
        it('should handle a one-level toc', () => {
            const toc = [
                [{ label: 'section 1', href: '1.html' }],
                [{ label: 'section 2', href: '2.html' }],
            ];
            sut.build(toc);
            expect(sut.result).toEqual([
                'navMap',
                [
                    'navPoint',
                    { id: 'ncx-000001', playOrder: '1' },
                    ['navLabel', ['text', 'section 1']],
                    ['content', { src: '1.html' }]
                ],
                [
                    'navPoint',
                    { id: 'ncx-000002', playOrder: '2' },
                    ['navLabel', ['text', 'section 2']],
                    ['content', { src: '2.html' }]
                ]
            ]);
            expect(sut.maxDepth).toBe(1);
        });
        it('should handle a multi-level toc', () => {
            const toc = [
                [{ label: 'section 1', href: '1.html' },
                    [{ label: 'section 1.1', href: '1.html#1' },
                        [{ label: 'section 1.1.1', href: '1.html#1.1' }]
                    ],
                    [{ label: 'section 1.2', href: '1.html#2' }],
                ],
                [{ label: 'section 2', href: '2.html' }],
            ];
            sut.build(toc);
            expect(sut.result).toEqual([
                'navMap',
                [
                    'navPoint',
                    { id: 'ncx-000001', playOrder: '1' },
                    ['navLabel', [ 'text', 'section 1']],
                    ['content', { src: '1.html' }],
                    [
                        'navPoint',
                        { id: 'ncx-000002', playOrder: '2' },
                        ['navLabel', [ 'text', 'section 1.1']],
                        ['content', { src: '1.html#1' }],
                        [
                            'navPoint',
                            { id: 'ncx-000003', playOrder: '3' },
                            ['navLabel', [ 'text', 'section 1.1.1']],
                            ['content', { src: '1.html#1.1' }]
                        ]
                    ],
                    [
                        'navPoint',
                        { id: 'ncx-000004', playOrder: '4' },
                        ['navLabel', ['text', 'section 1.2']],
                        ['content', { src: '1.html#2' }]
                    ]
                ],
                [
                    'navPoint',
                    { id: 'ncx-000005', playOrder: '5' },
                    ['navLabel', ['text', 'section 2']],
                    ['content', { src: '2.html' }]
                ]
            ]);
            expect(sut.maxDepth).toBe(3);
        });
    });

});
