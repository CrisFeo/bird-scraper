const cheerio = require('cheerio');
const Future = require('fluture');
const needle = require('needle');
const R = require('ramda');
const S = require('sanctuary');


const AVIBASE_URL = 'http://avibase.bsc-eoc.org/avibase.jsp';
const REQUEST_INTERVAL = 200;


// Cheerio utilities
/////////////////////////////

// parseHTML :: String -> Future CheerioError CheerioRoot
const parseHTML = Future.encase(cheerio.load);

// query :: CheerioRoot -> String -> CheerioElement -> [CheerioElement]
const query = R.curry(($, query, elt) => $(elt).find(query).get());

// text :: CheerioRoot -> CheerioElement -> String
const text = R.curry(($, elt) => $(elt).text());

// attr :: CheerioRoot -> String -> CheerioElement -> String
const attr = R.curry(($, name, elt) => $(elt).attr(name));

// Misc utilities
/////////////////////////////

// run :: [(()->a), (a->b), ... (m->n)] -> n
//
// Takes at list of functions where the first function is nullary. Returns the
// result of executing the functions in a manner similar to pipe except it
// occurs immediately with no initial argument.
const run = fns => R.reduce((x, fn) => fn(x), undefined, fns);

// post :: String -> Object -> Future NeedleError NeedleResponse
//
// Returns a Future for the result of a needle post against the given url with
// the provided body data.
const post = R.curry((url, data) => Future.node(c => needle.post(url, data, c)));

// Parsing
/////////////////////////////

// queryNextPage :: CheerioRoot -> Maybe String
const queryNextPage = $ => run([
  () => $('body').get(),
  query($, 'script'),
  R.map(text($)),
  S.find(R.test(/function nextPage\(\) {/)),
  R.chain(S.match(/f\.startstr\.value="(.+)";/)),
  R.chain(S.last),
  R.unnest,
]);

// queryBirdTable :: CheerioRoot -> [RawBird]
// RawBird :: [CheerioElement, CheerioElement, CheerioElement, CheerioElement]
const queryBirdTable = $ => run([
  () => $('body').get(),
  query($, 'table'),
  R.last,
  query($, 'tr'),
  R.map(query($, 'td')),
  R.tail,
]);

// rawBirdToID :: CheerioRoot -> RawBird -> String
const rawBirdToID = R.curry(($, rawBird) => run([
  () => rawBird,
  R.nth(2),
  query($, 'a'),
  R.head,
  attr($, 'href'),
  R.match(/javascript:changespecies\('([A-F0-9]+)'\)/),
  R.last,
]));

// rawBirdToBird :: CheerioRoot -> RawBird -> Bird
// Bird:: { id       :: String
//        , name     :: String
//        , language :: String
//        , species  :: String
//        , status   :: String }
const rawBirdToBird = R.curry(($, rawBird) => run([
  () => rawBird,
  R.map(text($)),
  R.zip(['name', 'language', 'species', 'status']),
  R.fromPairs,
  R.assoc('id', rawBirdToID($, rawBird)),
]));

// parseSearchPage :: CheerioRoot -> SearchPage
// SearchPage :: { birds         :: [Bird]
//               , nextPage      :: Maybe String }
const parseSearchPage = $ => ({
  nextPage: queryNextPage($),
  birds: run([
    () => queryBirdTable($),
    R.map(rawBirdToBird($)),
  ]),
});

// Request
/////////////////////////////

// createAvibaseRequestBody :: String -> Object
const createAvibaseRequestBody = start => ({
  qstr: ' ',
  qtype: 2,
  qlang: 'EN',
  startstr: start,
});

// fetchSearchPage :: String -> Future Error CheerioRoot
const fetchSearchPage = start => run([
  () => Future.of(start),
  R.map(createAvibaseRequestBody),
  R.chain(Future.after(REQUEST_INTERVAL)),
  R.chain(post(AVIBASE_URL)),
  R.map(R.prop('body')),
  R.chain(parseHTML),
]);

// State
/////////////////////////////

// State :: { allBirds: [Bird]
//          , nextPage: Maybe String }
const State = (allBirds, nextPage) => ({
  allBirds: allBirds,
  nextPage: nextPage,
});

// reduceState :: State -> SearchPage -> State
const reduceState = R.curry((state, searchPage) => State(
  R.concat(state.allBirds, searchPage.birds),
  searchPage.nextPage));

// _crawlSearchResults :: State -> Future Error State
const _crawlSearchResults = state => run([
  () => Future.of(state.nextPage.value),
  R.chain(fetchSearchPage),
  R.map(parseSearchPage),
  R.map(reduceState(state)),
  R.chain(crawlSearchResults),
]);

// crawlSearchResults :: State -> Future Error State
const crawlSearchResults = state => {
  switch (true) {
  case S.isJust(state.nextPage):    return _crawlSearchResults(state);
  case S.isNothing(state.nextPage): return Future.of(state);
  default:
    console.error('state.nextPage was not a Maybe.', state);
    return Future.of(state);
  }
};

// Execution
/////////////////////////////

run([
  () => Future.of(State([], S.Just(''))),
  R.chain(crawlSearchResults),
  R.map(R.prop('allBirds')),
  R.map(birds => JSON.stringify(birds, null, '  ')),
]).fork(s => process.stderr.write(s),
        s => process.stdout.write(s));
