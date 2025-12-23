console.log("INICIANDO SERVER...");
    
const path = require('path');
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static("public"));
app.use(express.json());

const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

app.use(session({
    secret: "minha_chave_secreta",
    resave: false,
    saveUninitialized: true
}));

passport.use(new GoogleStrategy({
   clientID: process.env.GOOGLE_CLIENT_ID,
clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://authify-site-production-282b.up.railway.app/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    let user = await User.findOne({ googleId: profile.id });
    if (!user) {
        user = await new User({
            username: profile.displayName,
            googleId: profile.id
        }).save();
    }
    done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    const user = await User.findById(id);
    done(null, user);
});


app.use(passport.initialize());
app.use(passport.session());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});


// 🔗 CONEXÃO COM O MONGODB (COLE SUA STRING AQUI)
mongoose.connect("mongodb+srv://admin:98634104@shoxz.p6c5vdn.mongodb.net/?appName=shoxz")
.then(() => console.log("MongoDB conectado"))
.catch(err => console.log("Erro MongoDB:", err));

// SCHEMA DAS KEYS
const KeySchema = new mongoose.Schema({
    key: String,
    usada: Boolean, // ainda pode usar como flag geral
    criadaEm: { type: Date, default: Date.now },
    expiraEm: Date,
    computadores: { type: [String], default: [] } // lista de PCs que já usaram a key
});


// SCHEMA DOS USUÁRIOS
const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    googleId: String // opcional, usado para login com Google
});

// MODELOS
const Key = mongoose.model("Key", KeySchema);
const User = mongoose.model("User", UserSchema);

// Registrar usuário
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    const userExist = await User.findOne({ username });
    if (userExist) return res.json({ sucesso: false, msg: "Usuário já existe" });

    await new User({ username, password }).save();
    res.json({ sucesso: true, msg: "Usuário registrado" });
});

// Login de usuário
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username, password });
    if (!user) return res.json({ sucesso: false, msg: "Usuário ou senha incorretos" });

    res.json({ sucesso: true, msg: "Login feito com sucesso" });
});


// ➕ CRIAR KEY
app.get("/create-key", async (req, res) => {
    const { dias } = req.query; // recebe quantos dias via URL
    const novaKey = "KEY-" + Math.random().toString(36).substr(2, 10);

    // se não passar dias, usa 30 por padrão
    const duracao = dias ? parseInt(dias) : 30;

    // define expiração
    const expira = new Date();
    expira.setDate(expira.getDate() + duracao);

    await new Key({
        key: novaKey,
        usada: false,
        expiraEm: expira
    }).save();

    res.send(`Key criada: ${novaKey} - expira em ${duracao} dias`);
});



// Validar key com clientId (PC)
app.post("/validar-key", async (req, res) => {
    const { key, clientId } = req.body; // clientId identifica o PC ou usuário

    const keyDB = await Key.findOne({ key });
    if (!keyDB) return res.json({ sucesso: false, msg: "Key inválida" });
    if (new Date() > keyDB.expiraEm) return res.json({ sucesso: false, msg: "Key expirada" });

    // se o PC ainda não está registrado na key
    if (!keyDB.computadores.includes(clientId)) {
        keyDB.computadores.push(clientId);
        await keyDB.save();
    }

    res.json({ sucesso: true, msg: "Key válida" });
});


// Rota para listar todas as keys (painel admin)
app.get("/admin/keys", async (req, res) => {
    const keys = await Key.find();
    res.json(keys);
});

// iniciar login com Google
app.get("/auth/google", passport.authenticate("google", { scope: ["profile"] }));

// callback do Google
app.get("/auth/google/callback", 
    passport.authenticate("google", { failureRedirect: "/login.html" }),
    (req, res) => {
        res.redirect("/painel.html"); // redireciona após login
});

// Validar key
app.post("/validar-key", async (req, res) => {
    const { key } = req.body;

    const keyDB = await Key.findOne({ key });

    if (!keyDB) return res.json({ sucesso: false, msg: "Key inválida" });
    if (keyDB.usada) return res.json({ sucesso: false, msg: "Key já usada" });
    if (new Date() > keyDB.expiraEm) return res.json({ sucesso: false, msg: "Key expirada" });

    keyDB.usada = true;
    await keyDB.save();

    res.json({ sucesso: true, msg: "Key válida" });
});

// Apagar key
app.delete("/delete-key/:id", async (req, res) => {
    const { id } = req.params;
    await Key.findByIdAndDelete(id);
    res.json({ sucesso: true, msg: "Key apagada" });
});

// Resetar key
app.post("/reset-key/:id", async (req, res) => {
    const { id } = req.params;
    const { dias } = req.body;

    const keyDB = await Key.findById(id);
    if (!keyDB) return res.json({ sucesso: false, msg: "Key não encontrada" });

    keyDB.usada = false;
    if (dias) {
        const novaData = new Date();
        novaData.setDate(novaData.getDate() + parseInt(dias));
        keyDB.expiraEm = novaData;
    }
    await keyDB.save();

    res.json({ sucesso: true, msg: "Key resetada" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});


