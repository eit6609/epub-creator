'use strict';

const { EPUBCreator } = require('../../src/index.js');

describe('index.js', () => {
    it('should export EPUBCreator', () => {
        expect(EPUBCreator).toEqual(jasmine.any(Function));
    });
});
