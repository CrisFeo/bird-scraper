Error.stackTraceLimit = 100;

const $ = require('sanctuary-def');
const Future = require('fluture');
const needle = require('needle');
const R = require('ramda');

const dom = require('./dom');
const fs = require('./fs');
const S = require('./sanctuary');

const AVIBASE_URL = 'http://avibase.bsc-eoc.org/avibase.jsp';
const REQUEST_INTERVAL = 100;
const OUTPUT_BASE_PATH = ['.', 'data'];


// Utilities
/////////////////////////////

// post :: String -> Object -> Future Error String
//
// post returns a Future for the response body of a needle post against the
// given url with the provided request body.
const post = R.curry((url, body) => S.pipe([
  S.K(Future.node(c => needle.post(url, body, c))),
  R.map(r => S.toMaybe(R.prop('body', r))),
  R.chain(S.maybe(Future.reject(Error('Could not extract "body" from needle response')),
                  Future.of)),
])(null));


// State
/////////////////////////////

// State :: { htmlData  :: [String]
//          , queryData :: { qstr     :: Maybe String,
//                         , startstr :: Maybe String }}
const State = R.curry((htmlData, qstr, startstr) => ({
  htmlData: htmlData,
  queryData: {
    qstr: qstr,
    startstr: startstr,
  },
}));

// htmlData :: Lens State [String]
const htmlData = R.lensProp('htmlData');

// qstr :: Lens State (Maybe String)
const qstr = R.lensPath(['queryData', 'qstr']);

// startstr :: Lens State (Maybe String)
const startstr = R.lensPath(['queryData', 'startstr']);

// updateState :: State -> String -> State
const updateState = R.curry((state, html) => S.pipe([
  S.K(state),
  R.over(htmlData, R.append(html)),
  s => R.set(startstr, lastPageStartStr(s), s),
])(null));

// Parsing
/////////////////////////////

// parseNextPageStartStr :: [String] -> Maybe String
const parseNextPageStartStr = scripts => {
  // findNextPageScript :: [String] -> Maybe String
  const findNextPageScript = S.find(R.test(/function nextPage\(\) {/));
  // matchStartStr :: String -> Maybe String
  const matchStartStr = S.pipe([
    S.match(/f\.startstr\.value="(.+)";/),
    R.sequence(R.of),
    R.map(R.unnest),
    S.last,
    R.unnest,
  ]);
  return S.pipe([
    findNextPageScript,
    R.chain(matchStartStr),
  ])(scripts);
};

// lastPageStartStr :: State => Maybe String
const lastPageStartStr = state => {
  // lastPageHTML :: State -> Maybe [String]
  const lastPageHTML = S.pipe([
    R.view(htmlData),
    S.toMaybe,
    R.chain(S.last),
  ]);
  // queryAllScripts :: String -> Either Error [String]
  const queryAllScripts = S.pipe([
    dom.parseHtml,
    R.map(dom.query('script')),
    R.map(R.map(dom.text)),
  ]);
  return S.pipe([
    lastPageHTML,
    R.map(queryAllScripts),
    R.chain(S.eitherToMaybe),
    R.chain(parseNextPageStartStr),
  ])(state);
};

// createRequestBody :: State => Object
const createRequestBody = state => ({
  qstr: S.fromMaybe(' ', R.view(qstr, state)),
  qlang: 'en',
  qtype: 2, // Partial string
  qinclsp: 2, // Species only
  startstr: S.fromMaybe('', R.view(startstr, state)),
});

// Execution
/////////////////////////////

// saveLastSearchResult :: State -> Future Error State
const saveLastSearchResult = state => {
  // filePath :: State -> Maybe [String]
  const filePath = state => {
    const path = S.fromMaybe('ALL', R.view(qstr, state));
    const name = S.pipe([R.view(htmlData), R.length, l => l + '.html'])(state);
    return S.Just(R.concat(OUTPUT_BASE_PATH, [path, name]));
  };
  // fileContents :: State -> Maybe String
  const fileContents = S.pipe([R.view(htmlData), S.last]);
  return S.pipe([
    R.of,
    R.ap([filePath, fileContents]),
    R.sequence(S.Just),
    R.map(R.apply(fs.writeFilePath)),
    S.fromMaybe(Future.reject(Error('Could not construct file info from state'))),
    R.chain(() => Future.of(state)),
  ])(state);
};

// crawlLoop :: State -> Future Error State
const crawlLoop = state => S.pipe([
   createRequestBody,
   Future.after(REQUEST_INTERVAL),
   R.chain(post(AVIBASE_URL)),
   R.map(updateState(state)),
   R.chain(saveLastSearchResult),
   R.chain(s => S.isJust(R.view(startstr, s)) ? crawlLoop(s) : Future.of(s))
])(state);

// module.exports :: String -> Future Error String
module.exports = S.pipe([
  query => R.isEmpty(query) || R.isNil(query) ? S.Nothing() : S.Just(query),
  maybeQuery => State([], maybeQuery, S.Just('')),
  crawlLoop,
  R.map(R.view(htmlData)),
  R.map(R.length),
  R.map(R.toString),
  R.map(R.concat('Pages retrieved: ')),
]);
