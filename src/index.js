const express = require("express");
const url = require("url");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const routing = require("./routes/index");
const passport = require("passport");
const session = require("express-session");
const Strategy = require("passport-discord").Strategy;
const bodyParser = require("body-parser");
const config = require("./config.json");
var cookieParser = require("cookie-parser");
const Discord = require("discord.js");
const { Collection } = require("discord.js");
const MemoryStore = require("memorystore")(session);
const cors = require("cors");
require("dotenv").config();
const rateLimit = require("express-rate-limit");
var MongoStore = require('rate-limit-mongo');
const glob = require("glob");
(async () => {
  const sitemap = require("express-sitemap")();
  let client = new Discord.Client();
  let serverClient = new Discord.Client();

  //setting up mongoose
  await mongoose.connect(config.MongoDbServer, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  serverClient.on("ready", () => {
    console.log(`${serverClient.user.tag} Is online and tracking guilds!`);
  });

  //connecting to the discord bot
  client.on("ready", () => {
    console.log(
      `Discord Client attached to express, logged in as: ${client.user.tag} \nBTX Internal Blockchian online and awaiting requests. \nBotrix Network online.`
    );
  });

  client.commands = new Collection();
  client.aliases = new Collection();
  client.limits = new Collection();
  client.config = config;

  serverClient.commands = new Collection();
  serverClient.aliases = new Collection();
  serverClient.limits = new Collection();
  serverClient.config = config;

  const serverCommand = require("./bslBot/structures/command");
  serverCommand.run(serverClient);

  const serverEvents = require("./bslBot/structures/event");
  serverEvents.run(serverClient);

  console.log("Connected to database on " + config.MongoDbServer);
  var app = express();

  const apiLimiter = rateLimit({
  store: new MongoStore({
     uri: config.MongoDbServer,
     collectionName: "rate-limits",
     expireTimeMs:  60 * 60 * 1000, // 1 hour window
     resetExpireDateOnChange: true
     }),
       windowMs: 60 * 60 * 1000, // 1 hour window
       max: 4,
       message:
   ({ error: true, message:  "Too many requests, you have been rate limited. Please try again in one hour." })
   });


  //init our auth
  passport.use(
    new Strategy(
      {
        clientID: config.id,
        clientSecret: config.clientSecret,
        callbackURL: `${config.domain}/callback`,
        scope: ["identify", "guilds"],
      },
      (accessToken, refreshToken, profile, done) => {
        process.nextTick(() => done(null, profile));
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  app.use(
    session({
      store: new MemoryStore({ checkPeriod: 86400000 }),
      secret:
        "#@%#&^$^$%@$^$&%#$%@#$%$^%&$%^#$%@#$%#E%#%@$FEErfgr3g#%GT%536c53cc6%5%tv%djfidyyjgmfjfybfybcdgvc6hnkd",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use("/api", apiLimiter);
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(cors());

  //setting the app settings
  app.set("view engine", "ejs");
  app.set("client", client);
  app.set("serverClient", serverClient);
  app.set("views", "./src/views");
  app.disable("x-powered-by");
  app.disable("server");
  const checkAuth = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect("/login");
  };

  //authentication endpoints
  app.get(
    "/login",
    (req, res, next) => {
      req.session.backURL = req.get("Referer");
      res.cookie("referer", req.get("Referer"));
      if (req.session.backURL) {
        req.session.backURL = req.session.backURL;
      } else if (req.get("Referrer")) {
        const parsed = url.parse(req.get("Referrer"));
        if (parsed.hostname === app.locals.domain) {
          req.session.backURL = parsed.path;
        }
      } else {
        req.session.backURL = "/";
      }
      next();
    },
    passport.authenticate("discord")
  );

  app.get(
    "/callback",
    passport.authenticate("discord", { failureRedirect: "/" }),
    (req, res) => {
      if (req.cookies) {
        const url = req.headers.referrer;
        req.session.backURL = null;
        res.redirect(req.cookies.referer);
      } else {
        res.redirect("/");
      }
    }
  );

  app.get("/logout", function (req, res) {
    // We destroy the session.
    req.session.destroy(() => {
      // We logout the user.
      req.logout();
      // We redirect user to index.
      res.redirect("/");
    });
  });

  app.use("/", express.static("./src/static"));
  app.use(bodyParser());
  app.use("/", routing);
  app.use(express.static(__dirname + "/public"));
  app.use(cookieParser());

  client.login(config.Token);
  serverClient.login(config.ServerToken);
  app.listen(config.port);

  app.use(function (req, res) {
    let data = {
      user: req.data,
      wallet: req.session,
    };
    res.render("error/404", data);
  });

  app.use(function (error, req, res, next) {
    res.send("500: Internal Server Error", 500);
    console.log(error);
  });
})();
