var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors')
const { createProxyMiddleware } = require('http-proxy-middleware');
require('./lib/redis');

// const routes = require('./routes');
 const routes = require('./routes/index');

var app = express();
// const redis = new Redis();

//Disable X-Powered-By header
app.disable('x-powered-by')

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use(logger('combined'));

var jsonOptions = {
  type: ['*/json', 'application/payment'],
  limit: '750kb'
}
app.use(express.json(jsonOptions));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

var corsOptions = {
  origin:'*',
  methods: ['POST','GET','HEAD'],
  optionsSuccessStatus: 200,
  allowedHeaders:['Content-Type', 'Origin','x-requested-with']
}

app.use(cors(corsOptions))

// app.use('/', initRouter("TEST4"))

// // catch 404 and forward to error handler
// app.use(function(req, res, next) {
//   next(createError(404));
// });

// // error handler
// app.use(function(err, req, res, next) {
//   // set locals, only providing error in development
//   res.locals.message = err.message;
//   res.locals.error = req.app.get('env') === 'development' ? err : {};

//   // render the error page
//   res.status(err.status || 500);
//   res.render('error');
// });

// module.exports = app;

module.exports = function App(indexer) {
  app.use('/', routes(indexer));

  // catch 404 and forward to error handler
  app.use(function(req, res, next) {
	next(createError(404));
  });

  // error handler
  app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
  });

  return app;
}
