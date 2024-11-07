import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "booknotes",
    password: "",
    port: 5432
});

db.connect();

const app = express();
const port = 3000;

let isEditor = false;

//Middleware
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

//DB operations for books table starts here

async function getBooks() {
    const result = await db.query("SELECT * FROM books ORDER BY title ASC");
    return result.rows;
}

async function getBookByID(book_id) {
    const result = await db.query("SELECT * FROM books WHERE id=$1",[book_id]);
    return result.rows[0];
}

async function getBooksByTitle(search){
    const result = await db.query("SELECT * FROM books WHERE LOWER(title) LIKE '%' || $1 || '%' ORDER BY title ASC", [search.toLowerCase()]);
    return result.rows;
}

async function getCoverURL(ISBN){
    // get the url of cover pic from the API
    const API_URL = "https://covers.openlibrary.org/b/isbn/";
    
    const result = await axios.get(API_URL + ISBN + ".json");
    return result.data.source_url;
}

async function addBooks(bookDetails) {
    const cover_url = await getCoverURL(bookDetails[3]);//base on ISBN
    if(cover_url){
        bookDetails.push(cover_url);
    }
    else {
        bookDetails.push("");
    }
    await db.query("INSERT INTO books(title, author, description, ISBN, cover_url) VALUES($1, $2, $3, $4, $5)", bookDetails);
}

async function updateBooks(bookDetails) {
    const cover_url = await getCoverURL(bookDetails[3]);//base on ISBN
    if(cover_url){
        bookDetails.push(cover_url);
    }
    else {
        bookDetails.push("");
    }
    await db.query("UPDATE books SET title=$1, author=$2, description=$3, ISBN=$4, cover_url=$6 WHERE id=$5", bookDetails);
}

async function deleteBooks(book_id) {
    await db.query("DELETE FROM notes WHERE book_id=$1", [book_id]);
    await db.query("DELETE FROM reviews WHERE book_id=$1", [book_id]);
    await db.query("DELETE FROM books WHERE id=$1", [book_id]);
}

//DB operations for books table ends here

//DB operations for reviews starts here

async function getReviews(){
    const result = await db.query("SELECT b.*, r.date_read, r.rating, r.review FROM books b JOIN reviews r ON b.id = r.book_id ORDER BY b.title ASC");
    return result.rows;
}

async function getReviewByID(book_id){
    const result = await db.query("SELECT * FROM reviews WHERE book_id = $1", [book_id]);
    if(result.rowCount > 0){
        return result.rows[0];
    }
    else{
        return "";
    }
}

async function getReviewsByTitle(title, sort) {
    const result = await db.query("SELECT b.*, r.date_read, r.rating, r.review FROM books b JOIN reviews r ON b.id = r.book_id WHERE LOWER(b.title) LIKE '%' || $1 || '%' ORDER BY " + sort + " ASC", [title.toLowerCase()]);
    return result.rows;
}

async function addReview(newReview, book_id){
    await db.query("INSERT INTO reviews(rating, date_read, review, book_id) VALUES($1, $2, $3, $4)", [newReview.rating, newReview.date_read, newReview.review, book_id]);
}

async function updateReview(reviewToUpdate){
    await db.query("UPDATE reviews SET date_read = $1, rating = $2, review = $3 WHERE id = $4", [reviewToUpdate.date_read, reviewToUpdate.rating, reviewToUpdate.review, reviewToUpdate.id]);
}

async function deleteReview(review_id){
    await db.query("DELETE FROM reviews WHERE id = $1", [review_id]);
}

//DB operations for reviews ends here

//TOP 3 view starts here

async function getTopRecommendations() {
    const result = await db.query("SELECT b.*, r.rating FROM books b JOIN reviews r ON b.id = r.book_id ORDER BY r.rating DESC LIMIT 3");
    return result.rows;
}

async function getMostRecent() {
    const result = await db.query("SELECT b.*, r.date_read FROM books b JOIN reviews r ON b.id = r.book_id ORDER BY r.date_read DESC LIMIT 3");
    return result.rows;
}

//TOP 3 view ends here

//DB operations for notes starts here

async function getNotes(book_id){
    const result = await db.query('SELECT * FROM notes WHERE book_id = $1 ORDER BY id ASC', [book_id]);
    return result.rows;
}

async function addNotes(notes, book_id){
    await db.query('INSERT INTO notes(notes, book_id) VALUES($1, $2) RETURNING *', [notes, book_id]);
}

async function updateNotes(note){
    await db.query('UPDATE notes SET notes = $1 WHERE id = $2 RETURNING *', [note.notes, note.id]);
}

async function deleteNotes(notes_id){
    await db.query('DELETE FROM notes WHERE id = $1', [notes_id]);
}

//DB operations for notes ends here

async function getViewByID(book_id){
    const result = await db.query("SELECT b.*, r.date_read, r.rating, r.review, n.notes FROM books b JOIN reviews r ON b.id = r.book_id LEFT JOIN notes n ON b.id = n.book_id WHERE b.id = $1", [book_id]);
    return result.rows;
}

async function isValid(username, password){
    const result = await db.query("SELECT * FROM editor WHERE LOWER(username) = $1 AND password = $2", [username.toLowerCase(), password]);
   
    if(result.rowCount > 0){
        isEditor = true;
    }
    else {
        isEditor = false;
    }

    return isEditor;
};

app.get("/", async (req, res) => {
    const topRecommendations = await getTopRecommendations();
    const mostRecent = await getMostRecent();
    res.render("index.ejs", {topRecommendations, mostRecent});
});

app.get("/reviews", async (req, res) => {
    const books = await getReviews();
    res.render("reviews.ejs", {books: books, sort: "title"});
});

app.get("/books", async (req, res) => {
    if(isEditor){
        const books = await getBooks();
        res.render("books.ejs", {books});
    }
    else{
        res.redirect("/editor");
    }
});

app.get("/about", (req, res) => {
    res.render("about.ejs");
});

app.get("/new-book", (req, res) => {
    res.render("bookDetails.ejs", {title: "New book", trans: "new", button: "Save"});
})

app.post("/submit-book", async (req, res) => {
    switch (req.body.submit) {
        case "new":
            await addBooks([req.body.title.trim(), req.body.author.trim(), req.body.description.trim(), req.body.isbn.trim()]);
            break;
    
        case "update":
            await updateBooks([req.body.title.trim(), req.body.author.trim(), req.body.description.trim(), req.body.isbn.trim(), req.body.id]);
            break;
        
        case "delete":
            await deleteBooks(parseInt(req.body.id));
            break;

        default:
            break;
    }
    res.redirect("/books");
});

app.get("/edit-book/:id", async (req, res) => {
    const book = await getBookByID(parseInt(req.params.id));
    res.render("bookDetails.ejs", {title:"Update book details", trans: "update", button: "Save", book: book});
})

app.get("/delete-book/:id", async (req, res) => {
    const book = await getBookByID(parseInt(req.params.id));
    res.render("bookDetails.ejs", {title:"Delete book", trans: "delete", button: "Delete", book: book});
})

app.get("/review/:id", async (req, res) => {
    const book = await getBookByID(parseInt(req.params.id));
    const review = await getReviewByID(parseInt(req.params.id));

    if(review){
        res.render("reviewDetails.ejs", {trans: "update", title: "Update/Delete review", book: book, review: review});
    }
    else {
        res.render("reviewDetails.ejs", {trans: "new", title: "Submit a review", book: book}); 
    }
});

app.post("/submit-review", async (req, res) => {
    switch (req.body.submit) {
        case "new":
            await addReview({rating: req.body.rating, date_read: req.body.date_read, review: req.body.review}, parseInt(req.body.book_id));
            break;

        case "update":
            await updateReview({rating: req.body.rating, date_read: req.body.date_read, review: req.body.review, id: parseInt(req.body.review_id)});
            break;

        case "delete":
            await deleteReview(parseInt(req.body.review_id));
            break;
    
        default:
            break;
    }
    
    res.redirect("/books");
})

app.get("/notes/:id", async (req, res) => {
    const book = await getBookByID(parseInt(req.params.id));  
    const notes = await getNotes(parseInt(req.params.id));
    res.render("notes.ejs", {book, notes}); 
});

app.post("/add-notes", async (req, res) => {
    if(req.body.submit === "save"){
        await addNotes(req.body.notes, parseInt(req.body.book_id));
        res.redirect("/notes/" + req.body.book_id);
    }
    else{
        res.redirect("/books");
    }
});

app.post("/edit-notes", async (req, res) => {    
    if(req.body.submit === "update"){
        await updateNotes({id: parseInt(req.body.notes_id), notes: req.body.notes.trim()});
    }
    else  if(req.body.submit === "delete"){
        await deleteNotes(parseInt(req.body.notes_id));
    }
    res.redirect("/notes/" + req.body.book_id);
});


app.get("/view/:id", async (req, res) => {
    const book = await getViewByID(parseInt(req.params.id));
    res.render("view.ejs", {book: book[0], notes: book});
});

app.post("/search-books", async (req, res) => {
    const books = await getBooksByTitle(req.body.title.trim());
    res.render("books.ejs", {books: books, search: req.body.title.trim()})
});

app.post("/search-reviews", async (req, res) => {
    const books = await getReviewsByTitle(req.body.title.trim(), req.body.sort);
    res.render("reviews.ejs", {books: books, search: req.body.title.trim(), sort: req.body.sort})
});

app.get("/editor", (req, res) => {
    if(isEditor){
        res.redirect("/books");
    }
    else{
        res.render("editor.ejs");
    }
});

app.post("/signin", async (req, res) => {
    if(await isValid(req.body.username.trim(), req.body.password)){
        res.redirect("/books");
    }
    else {
        res.render("editor.ejs", {error: "Invalid credentials"});
    }
});

app.listen(3000, () => {
    console.log(`The server is listening on post ${port}`);
});
