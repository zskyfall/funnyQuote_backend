var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cheerio = require('cheerio');
var request = require('async-request');
var mongoose = require('mongoose');

//connect mongoose db
mongoose.connect('mongodb://localhost/funnyquoute');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Lỗi kết nối csdl:'));
db.once('open', function() {
  console.log('Kết nối dbs thành công!')
});

var quoteSchema = mongoose.Schema({
	content: String,
	author: String,
	source: String,
	category: {
		id: String,
		title: String
	},
	view: {
		type: Number,
		default: 0
	},
	image: String
});

var categorySchema = mongoose.Schema({
	title: String,
	url: String,
	short_description: String,
	description: String,
	cover: String
});

var authorSchema = mongoose.Schema({
	name: String,
	short_description: String,
	description: String,
	cover: String
});

var Quote = mongoose.model('Quoute', quoteSchema);
var Category = mongoose.model('Category', categorySchema);
var Author = mongoose.model('Author', authorSchema);

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//GET ROUTES
app.get('/', function(req, res) {
	res.send("ok");
})

app.get('/sotaychemgio',async function(req, res) {
	let link = 'http://sotaychemgio.com/cat';

	let $ = cheerio.load(await getRawBody(link));

	$('li.media > a').each(async function(cat) {
		let url = $(this).attr('href');
		let cover = $(this).find('.media-left > img').attr('data-srcset');
			cover = cover.split(" ")[2];
		let title = $(this).find('.media-body > h3').text();
		let short_description = $(this).find('.media-body > p').text();

		let count;
		try {
			count = await Category.count({title: title});
			if(count < 1) {
				let newCat = new Category({
					title: title,
					url: url,
					short_description: short_description,
					cover: cover
				});

				await newCat.save();
			}

			
			let category = await Category.findOne({title: title});
			let last_page = await getLastPage(url);

			await crawlQuote(url, category._id, category.title);
			if(last_page > 1) {
				for(var i = 2; i <= last_page; i++) {
					let current_url = url + '/' + i;
					await crawlQuote(current_url);
				}
			}

		}
		catch(e) {
			console.log(e);
		}
		//console.log(cover);
	});
});

app.get('/quotes/:cat_id', function(req, res) {
	let category_id = req.params.cat_id;
	Quote.find({'category.id': category_id}, function(err, q) {
		res.json({quotes: q});
	});
});

app.get('/categories', function(req, res) {
	Category.find({}, function(err, c) {
		res.json({categories: c});
	});
});

//POSTE ROUTES


//Functions
async function getRawBody(url) {
	let response;
	try{
		response = await request(url);
	}
	catch(e) {
		console.log(e);
	}

	return response.body;
}

async function getLastPage(url) {
	let $ = cheerio.load(await getRawBody(url));
	try {
		let last_page = $('ul.pagination li:last-child a').attr('href');
		return parseInt(last_page[last_page.length-1]);
	}
	catch(e) {
		return 0;
	}

	
}

async function crawlQuote(url, cat_id, cat_title) {
	console.log(url);
	let $ = cheerio.load(await getRawBody(url));
	let number_pages = $('ul.pagination li').last();
	$('div.postItem > a').each(async function(post) {
		let href = $(this).attr('href');
		let content = $(this).find('blockquote p').text();
		let author = $(this).find('footer cite').text();

		let newQuote = new Quote({
			content: content,
			author: author,
			source: href,
			category: {
				id: cat_id,
				title: cat_title
			}

		});

		try {
			await newQuote.save();
		}
		catch(e) {
			console.log(e);
		}
		//console.log(author);
	});
}

async function isEmpty(url) {
	let $ = cheerio.load(await getRawBody(url));
	let test = '';
	$('div.postItem > a').each(async function(post) {
		let href = await $(this).attr('href');
		test += href;
		if(test == '') {
			//console.log('rong');
			return true;
		}
		else {
			//console.log(test);
			return false;
		}
	});

}
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

module.exports = app;
