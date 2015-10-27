'use strict';

var stream = require('stream');
var util = require('util');

function BufferStream(source) {

    if (!Buffer.isBuffer(source)) {
        throw(new Error('Source must be a buffer.'));
    }

    // Super constructor.
    stream.Readable.call(this);

    this._source = source;

    // Keep track of which portion of the source buffer is currently being
    // pushed onto the internal stream buffer during read actions.
    this._offset = 0;
    this._length = source.length;
}

util.inherits(BufferStream, stream.Readable);


// Read chunks from the source buffer into the underlying stream buffer.
BufferStream.prototype._read = function(size) {
    // If we haven't reached the end of the source buffer, push the next chunk onto
    // the internal stream buffer.
    if (this._offset < this._length) {
        this.push(this._source.slice(this._offset, (this._offset + size)));
        this._offset += size;
    }

    // If we've consumed the entire source buffer, close the readable stream.
    if (this._offset >= this._length) {
        this.push(null);
    }
};

module.exports = BufferStream;
