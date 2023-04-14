/*=-=-=-=-=-=-=-=-=-=
STATUS:
---------------------
FINALIZADAS:
 - Uso de API do Gmail: email de agendamento
 - Uso de API do Gmail: email de cancelamento
 - Uso de API do Telegram -> Ativado no DialogFlow
 - Uso de API do Google Calendar (criação de evento na agenda)  
 - Uso de API do Google Calendar (remoção de evento na agenda)  
 - Intent consultar agendamento
 - Intent remove agendamento
 - Intent profissional novo cadastro
 - Intent lista médicos
 - Intent login
 - Intent criar-agenda
 - Intent remover-agenda
 
 Bugs gerais:
 - Não compara nomes com acento ===> string.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
=-=-=-=-=-=-=-=-=-=*/

// Dependencies
const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const axios = require("axios");

// Express instances
const app = express();

// Sheet API adresses
// NOVOS links:
const DOCTORSHEET = "";
const APPSHEET = "";

// Gmail API (dependência 'nodemailer' incluída no 'package.json')
// Segui este tutorial: https://www.youtube.com/watch?v=-rcRf7yswfM
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
//const { OAuth2 } = google.auth;

// Misc constants
const MAIL_FROM = "";

// Google API Credentials
const CLIENT_ID = "";
const CLIENT_SECRET = "";
const REDIRECT_URI = "";
const REFRESH_TOKEN = ""; // GMail + Google Calendar
const AUTHUSER = "";

// Google Cloud oAuth client
// Segui este tutorial: https://youtu.be/zrLf4KMs71E
const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Google Calendar service
const calendar = google.calendar({
  version: "v3",
  auth: oAuth2Client,
});

// ================================================================
// FUNCTION: Create a Google Calendar event using Google API
// ================================================================
function createCalendarEvent(eventData) {
  calendar.events.insert(
    {
      auth: oAuth2Client,
      calendarId: "primary",
      resource: eventData,
    },
    function (err, event) {
      if (err) {
        console.error("Erro ao criar o evento: " + err);
        return;
      }
      console.log("Evento criado com sucesso: %s", event.htmlLink);
    }
  );
}
// ================================================================

// ================================================================
// FUNCTION: Get event by title
// ================================================================
async function getEventIdByTitle(eventTitle) {
  try {
    const response = await calendar.events.list({
      auth: oAuth2Client,
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
      q: eventTitle,
    });
    const events = response.data.items;
    if (events.length == 0) {
      console.log("Nenhum evento encontrado com este título.");
      return null;
    } else {
      const eventId = events[0].id;
      console.log("O ID do evento é " + eventId);
      return eventId;
    }
  } catch (err) {
    console.error("Erro ao buscar eventos: " + err);
    return null;
  }
}
// ================================================================

// ================================================================
// FUNCTION: Remove a Google Calendar event using Google API
// ================================================================
async function removeEvent(eventTitle) {
  try {
    const eventId = await getEventIdByTitle(eventTitle);
    if (!eventId) {
      console.log("Evento não encontrado.");
      return;
    }
    await calendar.events.delete({
      auth: oAuth2Client,
      calendarId: "primary",
      eventId: eventId,
    });
    console.log("O ID do evento é " + eventId);
    console.log("Evento excluído com sucesso!");
    return;
  } catch (err) {
    console.error("Erro ao excluir o evento: " + err);
  }
}
// ================================================================

// ================================================================
// FUNCTION: Send an email using Gmail API
// ================================================================
async function sendMail(data) {
  try {
    const accessToken = await oAuth2Client.getAccessToken();
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: AUTHUSER,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken,
      },
    });
    const result = await transport.sendMail(data);
    return result;
  } catch (error) {
    return error;
  }
}
// ================================================================

// ================================================================
// FUNCTION: Return the string reference for weekday number
// ================================================================
function weekdayToString(data) {
  switch (parseInt(data)) {
    case 0:
      return "Domingo";
      break;
    case 1:
      return "Segunda-feira";
      break;
    case 2:
      return "Terça-feira";
      break;
    case 3:
      return "Quarta-feira";
      break;
    case 4:
      return "Quinta-feira";
      break;
    case 5:
      return "Sexta-feira";
      break;
    case 6:
      return "Sábado";
      break;
  }
}
// ================================================================

// ================================================================
// FUNCTION: Return the weekday number by its name
// ================================================================
function stringToWeekday(data) {
  data = data.toLowerCase();
  switch (data) {
    case "domingo":
      return 0;
      break;
    case "segunda-feira":
      return 1;
      break;
    case "segunda":
      return 1;
      break;
    case "terça-feira":
      return 2;
      break;
    case "terça":
      return 2;
      break;
    case "terca-feira":
      return 2;
      break;
    case "terca":
      return 2;
      break;
    case "quarta-feira":
      return 3;
      break;
    case "quarta":
      return 3;
      break;
    case "quinta-feira":
      return 4;
      break;
    case "quinta":
      return 4;
      break;
    case "sexta-feira":
      return 5;
      break;
    case "sexta":
      return 5;
      break;
    case "sábado":
      return 6;
      break;
    case "sabado":
      return 6;
      break;
  }
}
// ================================================================

// ================================================================
// FUNCTION: Split the date from DialogFlow format
//           Format example: 2023-04-05T00:00:00-03:00
// ================================================================
function splitDate(data) {
  let splittedDate = [3];
  splittedDate[0] = data.split("-")[2].split("T")[0];
  splittedDate[1] = data.split("-")[1];
  splittedDate[2] = data.split("-")[0];

  return splittedDate;
}
// ================================================================

// ================================================================
// FUNCTION: Split the time from DialogFlow format
//           Format example: 2023-04-05T00:00:00-03:00
// ================================================================
function splitHour(data) {
  let splittedHour = [2];
  splittedHour[0] = data.split("T")[1].split("-")[0].split(":")[0];
  splittedHour[1] = data.split("T")[1].split("-")[0].split(":")[1];

  return splittedHour;
}
// ================================================================

// Config body parser for JSON data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Allow Express to serve static files
app.use(express.static("public"));

// FrontEnd
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Doctor data
var medico_nome;
var medico_sobrenome;
var medico_id;
var medico_dia;
var medico_hora;
var agenda_id;

// Patient data
var consulta_id;
var paciente_nome;
var paciente_sobrenome;
var paciente_email;
var eventId;

// Appointment data
var data;
let apDay;
let apMonth;
let apYear;

var hora;
let apHour;
let apMin;

// Webhook
app.post("/dialogflow", function (req, res) {
  // Get the intent name
  var intentName = req.body.queryResult.intent.displayName;

  /*************************************
  INTENT: agendamento
  *************************************/
  if (intentName == "agendamento") {
    // Get the "agendamento" data
    medico_nome = req.body.queryResult.parameters["medico_nome"];
    medico_sobrenome = req.body.queryResult.parameters["medico_sobrenome"];
    data = req.body.queryResult.parameters["data"];
    hora = req.body.queryResult.parameters["horario"];
    paciente_nome = req.body.queryResult.parameters["nome"];
    paciente_sobrenome = req.body.queryResult.parameters["sobrenome"];
    paciente_email = req.body.queryResult.parameters["email"];

    // Split "data" string
    const dataRec = new Date(data);
    const horaRec = new Date(hora);
    const apDay = dataRec.getUTCDate();
    const apMonth = dataRec.getUTCMonth() + 1; // Referência de Month inicia em 0
    const apYear = dataRec.getUTCFullYear();
    const apHour = horaRec.getUTCHours() - 3; // Ajusta fuso horário brasileiro
    const apMin = horaRec.getUTCMinutes();

    // Por padrão, o DialogFlow reconhece horários entre 1 e 12, sem marcação de am/pm, como padrão de 12h.
    // A correção deveria ser feita no próprio DialogFlow, mas até o momento ele não permitiu editar as "actions" das "intents".
    // Então, a melhor solução será indicar se o horário é am ou pm no momento do agendamento.

    // Get the sheet data and find the doctor
    // Melhoria: Se a pessoa digitar o nome errado, corrigir (ou salvar sem acentos e tudo minúsculo)
    return axios
      .get(
        DOCTORSHEET +
          "/search?medico_nome=" +
          medico_nome +
          "&medico_sobrenome=" +
          medico_sobrenome
      )
      .then((response) => {
        const medicos = response.data;

        // Verify if the doctor exists
        if (!medicos.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas não existe profissional com o nome informado (Dr(a) " +
              medico_nome +
              " " +
              medico_sobrenome +
              "). Confira se digitou o nome e sobrenome corretamente!",
          });
        } else {
          // Get the doctor ID
          medico_id = medicos[0].medico_id;

          // Get the weekday to compare with doctor´s agenda
          const dataFormat = new Date(data);
          let weekdayPatient = dataFormat.getDay();

          // Verify if it is a valid weekday for this doctor
          let weekdayOk = false;
          for (let i = 0; i < medicos.length; i++) {
            if (medicos[i].medico_dia == weekdayPatient) {
              weekdayOk = true;
            }
          }

          if (!weekdayOk) {
            return res.json({
              fulfillmentText:
                "Desculpe, mas o médico escolhido não tem agenda para " +
                weekdayToString(weekdayPatient) +
                ", no horário " +
                apHour +
                ":00.",
            });
          } else {
            return axios
              .get(
                APPSHEET +
                  "/search?consulta_dia=" +
                  apDay +
                  "/" +
                  apMonth +
                  "/" +
                  apYear +
                  "&consulta_hora=" +
                  parseInt(apHour)
              )
              .then((response) => {
                const datas = response.data;

                if (datas.length) {
                  return res.json({
                    fulfillmentText:
                      "Desculpe, mas já existe outra consulta " +
                      "agendada neste mesmo horário. " +
                      "Por favor, escolha outro horário.",
                  });
                } else {
                  // Generate a sequential ID
                  return axios
                    .get(
                      APPSHEET + "?sort_by=consulta_id&sort_order=desc&limit=1"
                    ) // https://docs.sheetdb.io/sheetdb-api/read
                    .then((response) => {
                      const lastRecord = response.data[0];
                      if (lastRecord) {
                        consulta_id = parseInt(lastRecord.consulta_id) + 1;
                      } else {
                        consulta_id = 1;
                      }

                      // Create the mail dataset
                      const mailOptions = {
                        from: MAIL_FROM,
                        to: paciente_email,
                        subject: "ClínicaMédica: Confirmação de agendamento",
                        text:
                          "Olá, " +
                          paciente_nome +
                          " " +
                          paciente_sobrenome +
                          "!\n\nVocê acaba de agendar uma consulta com Dr(a) " +
                          medico_nome +
                          " " +
                          medico_sobrenome +
                          " para o dia " +
                          apDay +
                          "/" +
                          apMonth.toString().padStart(2, "0") +
                          "/" +
                          apYear +
                          ", às " +
                          apHour +
                          ":" +
                          apMin.toString().padStart(2, "0") +
                          ".\n\n Solicitamos chegar com 15 minutos de antecedência para abertura de ficha. Tenha um ótimo dia!\n\nAtenciosamente,\nClínicaMédica",
                        html:
                          "Olá, " +
                          paciente_nome +
                          " " +
                          paciente_sobrenome +
                          "!<br><br>Você acaba de agendar uma consulta com Dr(a) " +
                          medico_nome +
                          " " +
                          medico_sobrenome +
                          " para o dia " +
                          apDay +
                          "/" +
                          apMonth.toString().padStart(2, "0") +
                          "/" +
                          apYear +
                          ", às " +
                          apHour +
                          ":" +
                          apMin.toString().padStart(2, "0") +
                          ".<br><br> Solicitamos chegar com 15 minutos de antecedência para abertura de ficha. Tenha um ótimo dia!<br><br>Atenciosamente,<br>ClínicaMédica",
                      };

                      // Send the email using Gmail API
                      sendMail(mailOptions)
                        .then((result) => console.log("Mail sent!\n\n", result))
                        .catch((error) => console.log(error.message));

                      // Create event dataset
                      const event = {
                        summary:
                          "Dr(a) " +
                          medico_nome +
                          " " +
                          medico_sobrenome +
                          " com " +
                          paciente_nome +
                          " " +
                          paciente_sobrenome,
                        location:
                          "Av. dos Estados, 5001 - Bangú, Santo André - SP, 09210-580",
                        description:
                          "Consulta com o paciente " +
                          paciente_nome +
                          " " +
                          paciente_sobrenome +
                          ".",
                        colorId: medico_id,
                        start: {
                          dateTime: new Date(
                            apYear,
                            apMonth - 1,
                            apDay,
                            apHour + 3, // Fuso horário
                            apMin
                          ),
                          timeZone: "UTC",
                        },
                        end: {
                          dateTime: new Date(
                            apYear,
                            apMonth - 1,
                            apDay,
                            apHour + 4, // Fuso horário + 1
                            apMin
                          ),
                          timeZone: "UTC",
                        },
                      };

                      // Create the event
                      createCalendarEvent(event);

                      // Send success message
                      res.json({
                        fulfillmentText:
                          "Agendamento realizado com sucesso para o(a) Dr(a) " +
                          medico_nome +
                          " " +
                          medico_sobrenome +
                          " no dia: " +
                          apDay +
                          "/" +
                          apMonth.toString().padStart(2, "0") +
                          "/" +
                          apYear +
                          " às " +
                          apHour +
                          ":" +
                          apMin.toString().padStart(2, "0") +
                          ".",
                      });

                      // Create the appointment dataset to post
                      const apDataSheet = [
                        {
                          consulta_id: consulta_id,
                          consulta_dia: apDay + "/" + apMonth + "/" + apYear,
                          consulta_hora: apHour,
                          medico_id: medico_id,
                          paciente_nome: paciente_nome,
                          paciente_sobrenome: paciente_sobrenome,
                          paciente_email: paciente_email,
                          evento_titulo: event.summary,
                        },
                      ];

                      // Post on the Sheet
                      axios.post(APPSHEET, apDataSheet);
                    });
                }
              });
          }
        }
      });
  }

  /*************************************
  INTENT: cancelar agendamento
  *************************************/
  if (intentName == "cancelar agendamento") {
    // Get the data
    data = req.body.queryResult.parameters["dia"];
    hora = req.body.queryResult.parameters["hora"];
    paciente_nome = req.body.queryResult.parameters["nome"];
    paciente_sobrenome = req.body.queryResult.parameters["sobrenome"];

    // Split "data" and "hora" strings
    let dataQuebrada = splitDate(data);
    apDay = dataQuebrada[0];
    apMonth = dataQuebrada[1];
    apYear = dataQuebrada[2];

    return axios
      .get(
        APPSHEET +
          "/search?paciente_nome=" +
          paciente_nome +
          "&paciente_sobrenome=" +
          paciente_sobrenome +
          "&consulta_dia=" +
          apDay +
          "/" +
          apMonth +
          "/" +
          apYear +
          "&consulta_hora=" +
          hora
      )
      .then((response) => {
        const consultas = response.data;

        if (!consultas.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas não há consultas agendadas para o dia e hora informados. Confira seus dados e tente novamente.",
          });
        } else {
          // Create the mail dataset
          const mailOptions = {
            from: MAIL_FROM,
            to: consultas[0].paciente_email,
            subject: "ClínicaMédica: Cancelamento de consulta",
            text:
              "Olá, " +
              paciente_nome +
              " " +
              paciente_sobrenome +
              "!\n\nVocê acaba de cancelar sua consulta" +
              /*" com Dr(a) " +
              medico_nome +
              " " +
              medico_sobrenome + */
              ", que estava agendada para o dia " +
              apDay +
              "/" +
              apMonth +
              "/" +
              apYear +
              ", às " +
              hora +
              ":00.\n\n Estamos à disposição para futuras consultas. Tenha um ótimo dia!\n\nAtenciosamente,\nClínicaMédica",
            html:
              "Olá, " +
              paciente_nome +
              " " +
              paciente_sobrenome +
              "!<br><br>Você acaba de cancelar sua consulta" +
              /*" com Dr(a) " +
              medico_nome +
              " " +
              medico_sobrenome + */
              ", que estava agendada para o dia " +
              apDay +
              "/" +
              apMonth +
              "/" +
              apYear +
              ", às " +
              hora +
              ":00.<br><br> Estamos à disposição para futuras consultas. Tenha um ótimo dia!<br><br>Atenciosamente,<br>ClínicaMédica",
          };


          // Delete event from Google Calendar
          removeEvent(consultas[0].evento_titulo);

          // Send the email using Gmail API
          sendMail(mailOptions)
            .then((result) => console.log("Mail sent!\n\n", result))
            .catch((error) => console.log(error.message));

          return axios
            .delete(APPSHEET + "/consulta_id/" + consultas[0].consulta_id)
            .then((response) => {
              return res.json({
                fulfillmentText: "Consulta desmarcada com sucesso!",
              });
            });
        }
      });
  }

  /*************************************
  INTENT: consultar agendamento
  *************************************/
  if (intentName == "consultar agendamento") {
    // Get the data
    paciente_nome = req.body.queryResult.parameters["nome"];
    paciente_sobrenome = req.body.queryResult.parameters["sobrenome"];

    return axios
      .get(
        APPSHEET +
          "/search?paciente_nome=" +
          paciente_nome +
          "&paciente_sobrenome=" +
          paciente_sobrenome
      )
      .then((response) => {
        const consultas = response.data;

        if (!consultas.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas não há consultas agendadas para o paciente informado. Confira seus dados e tente novamente.",
          });
        } else {
          // Mostrar resultado da consulta
          //let hora = "";
          let data_hora = "";

          consultas.forEach(function (consulta) {
            data_hora +=
              consulta.consulta_dia + " " + consulta.consulta_hora + "h \n";
            //hora = consulta.consulta_hora; "\n";
          });

          res.json({
            fulfillmentText:
              "Você possui os seguintes horários agendados: \n" +
              data_hora +
              "\nDeseja realizar novo agendamento ou remover horários?",
          });
        }
      });
  }

  /*************************************
  INTENT: consultar agendamento - desmarcar
  *************************************/
  if (intentName == "consultar agendamento - desmarcar") {
    // Get the data
    data = req.body.queryResult.parameters["data"];
    hora = req.body.queryResult.parameters["hora"];

    // Split "data" and "hora" strings
    let dataQuebrada = splitDate(data);
    apDay = dataQuebrada[0];
    apMonth = dataQuebrada[1];
    apYear = dataQuebrada[2];

    return axios
      .get(
        APPSHEET +
          "/search?paciente_nome=" +
          paciente_nome +
          "&paciente_sobrenome=" +
          paciente_sobrenome +
          "&consulta_dia=" +
          apDay +
          "/" +
          apMonth +
          "/" +
          apYear +
          "&consulta_hora=" +
          hora
      )
      .then((response) => {
        const consultas = response.data;

        if (!consultas.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas não há consultas agendadas para o dia e hora informados. Confira seus dados e tente novamente.",
          });
        } else {
          // Create the mail dataset
          const mailOptions = {
            from: MAIL_FROM,
            to: consultas[0].paciente_email,
            subject: "ClínicaMédica: Cancelamento de consulta",
            text:
              "Olá, " +
              paciente_nome +
              " " +
              paciente_sobrenome +
              "!\n\nVocê acaba de cancelar sua consulta" +
              /*" com Dr(a) " +
              medico_nome +
              " " +
              medico_sobrenome + */
              ", que estava agendada para o dia " +
              apDay +
              "/" +
              apMonth +
              "/" +
              apYear +
              ", às " +
              hora +
              ":00.\n\n Estamos à disposição para futuras consultas. Tenha um ótimo dia!\n\nAtenciosamente,\nClínicaMédica",
            html:
              "Olá, " +
              paciente_nome +
              " " +
              paciente_sobrenome +
              "!<br><br>Você acaba de cancelar sua consulta" +
              /*" com Dr(a) " +
              medico_nome +
              " " +
              medico_sobrenome + */
              ", que estava agendada para o dia " +
              apDay +
              "/" +
              apMonth +
              "/" +
              apYear +
              ", às " +
              hora +
              ":00.<br><br> Estamos à disposição para futuras consultas. Tenha um ótimo dia!<br><br>Atenciosamente,<br>ClínicaMédica",
          };

          // Send the email using Gmail API
          sendMail(mailOptions)
            .then((result) => console.log("Mail sent!\n\n", result))
            .catch((error) => console.log(error.message));

          return axios
            .delete(APPSHEET + "/consulta_id/" + consultas[0].consulta_id)
            .then((response) => {
              return res.json({
                fulfillmentText: "Consulta desmarcada com sucesso!",
              });
            });
        }
      });
  }

  /*************************************
  INTENT: listar medicos
  *************************************/
  if (intentName == "listar medicos") {
    return axios
      .get(DOCTORSHEET + "?sort_by=medico_id&sort_order=asc")
      .then((response) => {
        const medicos = response.data;
        let list = "";
        let lastName = "";
        let lastDay = "";

        if (medicos.length) {
          for (let i = 0; i < medicos.length; i++) {
            if (
              lastName !=
              medicos[i].medico_nome + " " + medicos[i].medico_sobrenome
            ) {
              list +=
                "\n\n" +
                medicos[i].medico_nome +
                " " +
                medicos[i].medico_sobrenome;
              lastName =
                medicos[i].medico_nome + " " + medicos[i].medico_sobrenome;
            }
            if (lastDay != weekdayToString(medicos[i].medico_dia)) {
              list += "\n\t" + weekdayToString(medicos[i].medico_dia) + ": ";
              lastDay = weekdayToString(medicos[i].medico_dia);
            }
            list += medicos[i].medico_hora + ":00 ";
          }

          // Melhorar exibição (testar pelo Telegram)

          return res.json({
            fulfillmentText:
              "Nesta clínica estão disponíveis os seguintes médicos:" +
              list +
              "\n\nGostaria de agendar, verificar agendamento ou cancelar uma consulta?",
          });
        } else {
          return res.json({
            fulfillmentText: "Infelizmente não existem médicos nesta clínica.",
          });
        }
      });
  }

  /*************************************
  INTENT: profissional - login
  *************************************/
  if (intentName == "profissional - login") {
    // Get the "profissional" data: Only the ID
    medico_id = req.body.queryResult.parameters["id"];
    medico_nome = req.body.queryResult.parameters["nome"];
    //medico_sobrenome = req.body.queryResult.parameters["sobrenome"];

    // Get the sheet data
    return (
      axios
        .get(
          DOCTORSHEET +
            "/search?medico_id=" +
            medico_id +
            "&medico_nome=" +
            medico_nome
        ) // +
        //"&medico_sobrenome=" + medico_sobrenome)
        .then((response) => {
          const medicos = response.data;

          // Verify if the ID exists
          if (!medicos.length) {
            return res.json({
              fulfillmentText:
                "Desculpe, mas não a correspondência entre o ID e o nome não existe (" +
                medico_id +
                ": " +
                medico_nome +
                "). Solicite cadastramento!",
            });
          } else {
            let horarios = "";
            let nome = "";

            medicos.forEach(function (medico) {
              nome = medico.medico_nome + " " + medico.medico_sobrenome;
              horarios +=
                weekdayToString(medico.medico_dia) +
                " " +
                medico.medico_hora +
                "h \n";
            });

            res.json({
              fulfillmentText:
                "O médico(a) " +
                nome +
                ", cadastrado(a) no ID " +
                medico_id +
                " possui os seguintes horários de atendimento cadastrados: \n\n" +
                horarios +
                '\n\nPara adicionar ou remover horários, digite "criar-horario" ou "remover-horario".',
            });
          }
        })
    );
  }

  /*************************************
  INTENT: criar-horario
  *************************************/
  if (intentName == "profissional - login - criar-horario") {
    // Get the "profissional" data
    medico_id = req.body.queryResult.parameters["id"];
    medico_dia = stringToWeekday(req.body.queryResult.parameters["dia"]);
    medico_hora = req.body.queryResult.parameters["horario"];

    // Get the sheet data
    return axios
      .get(DOCTORSHEET + "/search?medico_id=" + medico_id)
      .then((response) => {
        const medicos = response.data;

        // Verify if the ID existis
        if (!medicos.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas não existe profissional com o ID informado (" +
              medico_id +
              "). Solicite cadastramento!",
          });
        } else {
          medico_nome = medicos[0].medico_nome;
          medico_sobrenome = medicos[0].medico_sobrenome;

          // Verify if the agenda exists
          return axios
            .get(
              DOCTORSHEET +
                "/search?medico_dia=" +
                medico_dia +
                "&medico_hora=" +
                medico_hora +
                "&medico_nome=" +
                medico_nome +
                "&medico_sobrenome=" +
                medico_sobrenome
            )
            .then((response) => {
              const horarios = response.data;

              if (horarios.length) {
                return res.json({
                  fulfillmentText:
                    "Desculpe, mas este dia e horário já estão disponíveis na sua agenda.",
                });
              } else {
                // Get the last agenda Id and set the new one
                return axios
                  .get(
                    DOCTORSHEET + "?sort_by=agenda_id&sort_order=desc&limit=1"
                  )
                  .then((response) => {
                    const lastAgenda = response.data[0];
                    if (!lastAgenda) {
                      agenda_id = 1;
                    } else {
                      agenda_id = parseInt(lastAgenda.agenda_id) + 1;

                      // Create the doctors dataset to post
                      const docDataSheet = [
                        {
                          agenda_id: agenda_id,
                          medico_id: medico_id,
                          medico_nome: medico_nome,
                          medico_sobrenome: medico_sobrenome,
                          medico_dia: medico_dia,
                          medico_hora: medico_hora,
                        },
                      ];

                      // Post on the Sheet
                      axios.post(DOCTORSHEET, docDataSheet);
                      return res.json({
                        fulfillmentText: "Cadastro realizado com sucesso!",
                      });
                    }
                  });
              }
            });
        }
      });
  }

  /*************************************
  INTENT: remover-horario
  *************************************/
  if (intentName == "profissional - login - remover") {
    // Get the data
    medico_id = req.body.queryResult.parameters["id"];
    medico_dia = stringToWeekday(req.body.queryResult.parameters["dia"]);
    medico_hora = req.body.queryResult.parameters["horario"];

    return axios
      .get(
        DOCTORSHEET +
          "/search?medico_id=" +
          medico_id +
          "&medico_dia=" +
          medico_dia +
          "&medico_hora=" +
          medico_hora
      )
      .then((response) => {
        const registro = response.data;

        if (!registro.length) {
          return res.json({
            fulfillmentText:
              "Não existe registro de horário para " +
              medico_hora +
              ":00 de " +
              weekdayToString(medico_dia) +
              ".",
          });
        } else {
          return axios
            .delete(DOCTORSHEET + "/agenda_id/" + registro[0].agenda_id)
            .then((response) => {
              return res.json({
                fulfillmentText: "Registro excluído com sucesso!",
              });
            });
        }
      });
  }

  /*************************************
  INTENT: profissional - novo cadastro
  *************************************/
  if (intentName == "profissional - novo cadastro") {
    // Get the data
    medico_nome = req.body.queryResult.parameters["medico_nome"];
    medico_sobrenome = req.body.queryResult.parameters["medico_sobrenome"];
    //medico_dia = stringToWeekday(req.body.queryResult.parameters["dia"]);
    //medico_hora = req.body.queryResult.parameters["hora"];

    return axios
      .get(
        DOCTORSHEET +
          "/search?medico_nome=" +
          medico_nome +
          "&medico_sobrenome=" +
          medico_sobrenome
      )
      .then((response) => {
        const medicos = response.data;
        if (medicos.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas já existe um médico com o mesmo nome cadastrado. Entre em contato com a clínica, caso tenha se esquecido de seu ID.",
          });
        } else {
          // Get the last doctor ID and set the new one
          //medico_dia = stringToWeekday(req.body.queryResult.parameters["dia"]);
          //medico_hora = req.body.queryResult.parameters["hora"];
          return axios
            .get(DOCTORSHEET + "?sort_by=medico_id&sort_order=desc&limit=1")
            .then((response) => {
              const lastDoctor = response.data[0];
              if (!lastDoctor) {
                medico_id = 1;
                agenda_id = 1;

                // Set the new doctor
                /*const docDataSheet = [
                  {
                    agenda_id: agenda_id,
                    medico_id: medico_id,
                    medico_nome: medico_nome,
                    medico_sobrenome: medico_sobrenome,
                    //medico_dia: medico_dia,
                    //medico_hora: medico_hora,
                  },
                ];

                // Post on the Sheet
                axios.post(DOCTORSHEET, docDataSheet);*/
                return res.json({
                  fulfillmentText:
                    //"Cadastro realizado com sucesso! Seu ID é " +
                    "Seu ID é " +
                    medico_id +
                    ". Finalize seu cadastro registrando pelo menos 1 horário. Digite criar-horario",
                });
              } else {
                medico_id = parseInt(lastDoctor.medico_id) + 1;
                // Get the last agenda Id and set the new one
                return axios
                  .get(
                    DOCTORSHEET + "?sort_by=agenda_id&sort_order=desc&limit=1"
                  )
                  .then((response) => {
                    const lastAgenda = response.data[0];
                    if (!lastAgenda) {
                      agenda_id = 1; // redundante, mas vou deixar assim por enquanto
                    } else {
                      agenda_id = parseInt(lastAgenda.agenda_id) + 1;

                      // Set the new doctor
                      /*const docDataSheet = [
                        {
                          agenda_id: agenda_id,
                          medico_id: medico_id,
                          medico_nome: medico_nome,
                          medico_sobrenome: medico_sobrenome,
                          //medico_dia: medico_dia,
                          //medico_hora: medico_hora,
                        },
                      ];

                      // Post on the Sheet
                      axios.post(DOCTORSHEET, docDataSheet);*/
                      return res.json({
                        fulfillmentText:
                          //"Cadastro realizado com sucesso! Seu ID é " +
                          "Seu ID é " +
                          medico_id +
                          ". Finalize seu cadastro registrando pelo menos 1 horário. Digite criar-horario",
                      });
                    }
                  });
              }
            });
        }
      });
  }

  /*************************************
  INTENT: profissional - novo cadastro
  *************************************/
  if (intentName == "profissional - novo cadastro - criar-horario") {
    // Get the data
    medico_dia = stringToWeekday(req.body.queryResult.parameters["dia"]);
    medico_hora = req.body.queryResult.parameters["horario"];

    // Get the sheet data
    /*    return axios
    .get(DOCTORSHEET + "/search?medico_id=" + medico_id)
    .then((response) => {
      const medicos = response.data;

      // Verify if the ID existis
      if (!medicos.length) {
        return res.json({
          fulfillmentText:
            "Desculpe, mas não existe profissional com o ID informado (" +
            medico_id +
            "). Solicite cadastramento!",
        });
      } else {
        medico_nome = medicos[0].medico_nome;
        medico_sobrenome = medicos[0].medico_sobrenome;
*/
    // Verify if the agenda exists
    return axios
      .get(
        DOCTORSHEET +
          "/search?medico_dia=" +
          medico_dia +
          "&medico_hora=" +
          medico_hora +
          "&medico_nome=" +
          medico_nome +
          "&medico_sobrenome=" +
          medico_sobrenome
      )
      .then((response) => {
        const horarios = response.data;

        if (horarios.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas este dia e horário já estão disponíveis na sua agenda.",
          });
        } else {
          // Get the last agenda Id and set the new one
          return axios
            .get(DOCTORSHEET + "?sort_by=agenda_id&sort_order=desc&limit=1")
            .then((response) => {
              const lastAgenda = response.data[0];
              if (!lastAgenda) {
                agenda_id = 1;
              } else {
                agenda_id = parseInt(lastAgenda.agenda_id) + 1;

                // Create the doctors dataset to post
                const docDataSheet = [
                  {
                    agenda_id: agenda_id,
                    medico_id: medico_id,
                    medico_nome: medico_nome,
                    medico_sobrenome: medico_sobrenome,
                    medico_dia: medico_dia,
                    medico_hora: medico_hora,
                  },
                ];

                // Post on the Sheet
                axios.post(DOCTORSHEET, docDataSheet);
                return res.json({
                  fulfillmentText: "Cadastro realizado com sucesso!",
                });
              }
            });
        }
      });
    //}
    //});
  }
});

// Listen to the port
const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
