//EXPRESS
const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//CORS POLICY
const cors = require('cors');
app.use(cors());

//FIREBASE DATABASE
const firebase = require('firebase');
const firebaseConfig = require('./src/configs/firebaseConfig');
firebase.initializeApp(firebaseConfig);
const admin = firebase.auth();
const database = firebase.database();

//SCHEM'S
const signinSchema = require('./src/schems/signinSchema');
const signupSchema = require('./src/schems/signupSchema');

//PORT
const port = process.env.PORT || 8080;

app.post('/signin', async (req, res) => {
    try{
        const { email, password } = req.body;
        await signinSchema.validateAsync(req.body)
            .then( () => {
                admin.signInWithEmailAndPassword(email, password)
                    .then( () => { 
                        if(!admin.currentUser.emailVerified){
                            admin.signOut();
                            res.send({code: 400, message: "A regisztráció nem került megerősítésre! Kérlek nézd meg a megadott e-mail fiókod!"});
                        }
                        else
                            if(email == "ifiteka@gmail.com")
                              res.send({
                                role: "organizer"
                              });
                            else
                              res.send({
                                role: "team"
                              });
                    })
            })
            .catch((error) => {
                res.send({code: 400, message: error.message});
            })
      } catch (e) {
        res.send({code: 400, message: "Minden mezőt kötelező kitölteni!"});
      }
});

app.post('/signup', async (req, res) => {
    try{
      const { team, email, password } = req.body;
      await signupSchema.validateAsync(req.body)
      .then( () => { 
        admin.createUserWithEmailAndPassword(email, password)
        .then( () => {
          admin.currentUser.sendEmailVerification()
          .then( () => {
            database.ref('users/' + admin.currentUser.uid)
            .set({
                team: team,
                email: email,
                password: password
            })
            .then( () => {
              res.send({status: 'Validated'})
            })
            .catch((error) => {
              res.send({code: 400, message: error.message});
            })
          })
          .catch((error) => {
            res.send({code: 400, message: error.message});
          })
        })
        .catch((error) => {
          res.send({code: 400, message: error.message});
        })
      })
      .catch((error) => {
        res.send({code: 400, message: error.message});
      })
    } catch (e) {
      res.send({code: 400, message: "Minden mező kitöltése kötelező!"});
    }
  });

app.post('/forgotten_pass', async (req, res) => {
  try{
    const { email } = req.body;

    await admin.sendPasswordResetEmail(email)
    .then( () => {
      res.send({status: 'Sent'})
    })
    .catch((error) => {
      res.send({code: 400, message: error.message});
    })
  } catch (e) {
    res.send({code: 400, message: "Both fields are required!"});
  }
})

app.listen(port, () => {
    console.log(`Education app listening at http://localhost:${port}`);
})