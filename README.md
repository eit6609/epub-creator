# ePUB Creator

ePUB Creator lets you create an ePUB 2.0 ebook from a directory.

It accepts a directory with the whole content of the ebook (XHTML pages, images, stylesheets, etc.) and, with some
configuration, zips it up to an ePUB.

This lets you create and test your content with a local browser and, only after it works and it looks like you want,
proceed to create the ePUB. And, at least for me, this is the right way to do it.

Run this to install:

```bash
npm i @eit6609/epub-creator
```

## Example
Let's start with an example.

Suppose that:

* your content is located in the `/odissey` directory
* the spine (the linear reading order) is made by these files in the content directory: `front.html`, `book01.html`,
  `book02.html`, ..., `book23.html`, `book24.html`, `end.html`
* you want a TOC (Table Of Contents) that lists all the 24 "books"
* you want to use the file `images/cover.jpg` in the content directory as the cover of the book, and automatically add a
  cover page at the beginning of the spine
* you want to set the author and the title of the ebook but you don't care about the complete metadata
* you want the result in a file named `odissey.epub`

This is what you need to do:

```js
const { EPUBCreator } = require('@eit6609/epub-creator');

const spine = ['front.html'];
const toc = [];
for (let i = 1, i <= 24; i++) {
    const number = i < 10 ? `0${i}` : `${i}`;
    const fileName = `book${number}.html`;
    spine.push(fileName);
    toc.push([{ label: `Book ${i}`, href: fileName }]);
}
spine.push('end.html');

const options = {
    contentDir: '/odissey',
    spine,
    toc,
    cover: 'images/cover.jpg',
    simpleMetadata: {
        author: 'Homer',
        title: 'Odissey'
    }
};

const creator = new EPUBCreator(options);
creator.create('odissey.epub')
    .catch((error) => console.log(error));
```

Of course, the real world is more complex than that, so let's see in detail what you can do to configure the EPUBCreator
instance.

## API Reference

```js
constructor(options: object)
```

Creates an instance of EPUBCreator with the required options. Read on for the definition of the `options` object.

```js
async create(fileName: string): empty promise
```

Creates the ePUB with the given file name.

## Options Reference

### `contentDir`, string, required

It is the directory where your content (XHTML, images, stylesheets, fonts, etc.) is located.

The value can be a full path or a relative path.

All the file names that you may use in the options are relative to this directory.

All the files and subdirectories of the directory will be included in the ePUB, and a [manifest](http://idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.3) will be generated that lists all of them.

### `spine`, array, required

The [spine](http://idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.4) of an ePUB defines the linear reading order, i.e., the sequence of files that will be opened when you turn the pages.

You configure the spine providing an array of file names.

Remember that all the files potentially reachable by any reference mechanism must be included in the spine.

### `toc`, array, required

The TOC is a hierarchical table of contents in a compact tree representation that is used to generate the [NCX](http://idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.4.1) of the ePUB.

* the node of the tree is an array with this structure:
    * the first item is an object with these properties:
        * `label`, required string: the text of the link
        * `href`, required string: the name of the file, possibly containing a fragment specification
    * there can be items besides the first representing the children of the node, which are nodes in turn
* the TOC is an array of nodes.

#### Example

Suppose that the logical structure of the TOC is this:

* Front Matter
* Chapter 1
	* Section 1.1
	* Section 1.2
* Chapter 2

You represent the TOC with this array of nodes:

```js
const toc = [
    [{ label: 'Front Matter', href: 'front.html' }],
    [{ label: 'Chapter 1', href: 'chapter1.html' },
        [{ label: 'Section 1.1', href: 'chapter1.html#section1.1' }],
        [{ label: 'Section 1.2', href: 'chapter1.html#section1.2' }]
    ],
    [{ label: 'Chapter 2', href: 'chapter2.html' }]
];
```  

### `cover`, string, optional

If you provide the name of an image file as the value of this property, you will get the following:

* the image becomes the cover of the ePUB
* a page that displays the image is created and added at the beginning of the spine

### `simpleMetadata`, object, optional

Use this object to easily configure the most common metadata.

Its properties are:

* `language`, string, optional, default `'en'`, generates the required `dc:language` element
* `title`, string, optional, default `'Untitled'`, generates the required `dc:title` element
* `isbn`, string, optional, generates a `dc:identifier` element with `opf:scheme="ISBN"` 
* `author`, string, optional, generates the `dc:creator` element
* `description`, string, optional, generates the `dc:description` element
* `tags`, array of string, optional, generates a `dc:subject` element for every item of `tags`

A `dc:identifier` element with `opf:scheme="UUID"` is always generated and referenced by the
`unique-identifier` attribute of the `package` element, the root of the `content.opf` file.

#### Example

```js
const simpleMetadata = {
	language: 'it',
	title: 'Un libro',
    isbn: '1234567890',
	author: 'Un autore',
    description: 'Blurb!',
    tags: ['Adventure', 'Fiction']
};
```

The resulting `metadata` element of the `content.opf` file will be something like:

```xml
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId" opf:scheme="UUID">d5f9547e-b630-4c01-86a1-5cd11b226776</dc:identifier>
    <dc:identifier opf:scheme="ISBN">1234567890</dc:identifier>
    <dc:date>2019-11-19T11:22:50.448Z</dc:date>
    <dc:language>it</dc:language>
    <dc:creator opf:role="aut">Un autore</dc:creator>
    <dc:title>Un libro</dc:title>
    <dc:description>Blurb!</dc:description>
    <dc:subject>Adventure</dc:subject>
    <dc:subject>Fiction</dc:subject>
</metadata>
```

You can see that the element `dc:date` has been provided with a default value as described above.

### `metadata`, array, optional

If you need full control over the metadata you can use this property. What you provide is an array of XML elements, in
[JSML](https://github.com/eit6609/jsml) format, that will be merged with the `simpleMetadata` and will provide the
children of the `metadata` element of the `content.opf` file.

The `metadata` elements have priority over the `simpleMetadata` values.

More information about the ePUB 2.0 metadata [here](http://idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.2).

#### Example

```js
const metadata = [
    ['dc:contributor', { 'opf:role': 'edt' }, 'An Editor'],
    ['dc:date', new Date('2000-01-01')],
    ['dc:description', 'A good book']
];
const simpleMetadata = {
	title: 'A Book',
	author: 'An Author',
    description: 'A very good book'
};
```

The resulting `metadata` element will be something like:

```xml
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:contributor opf:role="edt">An Editor</dc:creator>
    <dc:date>2000-01-01T00:00:00.000Z</dc:date>
    <dc:description>A good book</dc:description>
    <dc:identifier id="BookId" opf:scheme="UUID">d5f9547e-b630-4c01-86a1-5cd11b226776</dc:identifier>
    <dc:language>en</dc:language>
    <dc:creator opf:role="aut">An Author</dc:creator>
    <dc:title>A Book</dc:title>
</metadata>
```

You can see that the element `dc:language` has been provided with a default value as
described above and that the `metadata` elements have been merged with the `simpleMetadata` generated
elements, giving `dc:description` priority over `description`.
