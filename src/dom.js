const cheerio = require('cheerio');
const R = require('ramda');

const S = require('./sanctuary');


const ROOT_SYMBOL = Symbol('root');
const ELEM_SYMBOL = Symbol('elem');

// Element :: { ROOT_SYMBOL :: CheerioRoot
//            , ELEM_SYMBOL :: CheerioElement }
//
// Element represents an element in a Cheerio document with all information
// necessary to perform further queries. Note that the keys are unexported
// symbols to avoid issues with sanctuary-def attempting to resolve types on
// the massive, circularly-referenced CheerioElement.
const Element = R.curry((root, element) => ({
  Type: 'Element',
  [ROOT_SYMBOL]: root,
  [ELEM_SYMBOL]: element,
}));

const root = element => element[ROOT_SYMBOL];
const elem = element => element[ELEM_SYMBOL];

// parseHtml :: String -> Either Error Element
//
// parseHtml parses an HTML string, returning either an error thrown by Cheerio
// or an Element representing the document `<body>`.
const parseHtml = html => {
  try {
    const r = cheerio.load(html);
    const e = r('body').get();
    return S.Right(Element(r, e));
  } catch (err) {
    return S.Left(err);
  }
};

// query :: String -> Element -> [Element]
//
// query searches by selector for descendants of the provided element. In the
// event of an error return [].
const query = R.curry((query, elt) => {
  try {
    const r = root(elt);
    const e = elem(elt);
    const matches = r(e).find(query).get();
    return R.map(Element(r), matches);
  } catch (err) {
    return [];
  }
});

// text :: Element -> String
//
// text retrieves the text content of the given node. If no content is present,
// returns an empty string.
const text = elt => {
  try {
    const r = root(elt);
    const e = elem(elt);
    return r(e).text();
  } catch (err) {
    return '';
  }
};

module.exports = {
  parseHtml: parseHtml,
  query: query,
  text: text,
};
