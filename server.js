/*=-=-=-=-=-=-=-=-=-=
STATUS:
---------------------
Pequenos bugs na intent de agendamento: 
 - Não compara nomes com acento ===> string.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
 - Não diferencia 0:00 de 12:00 (configuração de horários am/pm)
 - Paciente agenda às 8h, mas grava às 20h (configuração de horários am/pm)
 - Agendamento no calendário registra 3 dias após o registrado (subtraí 3 pra resolver a força) mas ainda está registrando no dia errado :(
 - Agendamento bloqueia tentativas de novos agendamentos no mesmo horário (ver freebusy)

FINALIZADAS:
 - Uso de API do Gmail: email de agendamento
 - Uso de API do Gmail: email de cancelamento
 - Uso de API do Telegram -> Ativado no DialogFlow
 - Uso de API do Google Calendar (criação de evento na agenda)  
 - Intent remove agendamento
 - Intent profissional novo cadastro
 - Intent lista médicos
 - Intent login
 - Intent criar-agenda
 - Intent remover-agenda
=-=-=-=-=-=-=-=-=-=*/

// Dependencies
const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const axios = require("axios");

// Express instances
const app = express();

// Sheet API adresses
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
const REDIRECT_URI = "https://developers.google.com/oauthplayground";
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
  calendar.freebusy.query(
    {
      resource: {
        timeMin: eventData.start.dateTime, //eventStartTime.toISOString(),
        timeMax: eventData.end.dateTime, //eventEndTime.toISOString(),
        timeZone: "America/Sao_Paulo",
        items: [{ id: "primary" }],
      },
    },
    (err, res) => {
      if (err) {
        return console.error("Free busy query error: ", err);
      }
      const eventsArr = res.data.calendars.primary.busy;
      if (!eventsArr.length) {
        return calendar.events.insert(
          {
            calendarId: "primary",
            resource: eventData,
          },
          (err) => {
            if (err) {
              return console.error("Calendar event creation error: ", err);
            }
            return console.log("Calendar event created.");
          }
        );
        return console.log("Sorry. I'm busy at this time!");
      }
    }
  );
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

// Webhook
app.post("/dialogflow", function (req, res) {
  // Get the intent name
  var intentName = req.body.queryResult.intent.displayName;

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

  // Appointment data
  var data;
  let apDay;
  let apMonth;
  let apYear;

  var hora;
  let apHour;
  let apMin;

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
    let dataQuebrada = splitDate(data);
    apDay = dataQuebrada[0]; //apDay = data.split("-")[2].split("T")[0];
    apMonth = dataQuebrada[1]; //apMonth = data.split("-")[1];
    apYear = dataQuebrada[2]; //apYear = data.split("-")[0];

    // Split "hora" string
    // TODO:  00:00 = 12:00 (?)
    //        2023-04-05T00:00:00-03:00
    let horaQuebrada = splitHour(hora);
    apHour = horaQuebrada[0]; //apHour = hora.split("T")[1].split("-")[0].split(":")[0];
    apMin = horaQuebrada[1]; //apMin = hora.split("T")[1].split("-")[0].split(":")[1];

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
                        },
                      ];

                      // Post on the Sheet
                      axios.post(APPSHEET, apDataSheet);

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
                          apMonth +
                          "/" +
                          apYear +
                          ", às " +
                          apHour +
                          ":00.\n\n Solicitamos chegar com 15 minutos de antecedência para abertura de ficha. Tenha um ótimo dia!\n\nAtenciosamente,\nClínicaMédica",
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
                          apMonth +
                          "/" +
                          apYear +
                          ", às " +
                          apHour +
                          ":00.<br><br> Solicitamos chegar com 15 minutos de antecedência para abertura de ficha. Tenha um ótimo dia!<br><br>Atenciosamente,<br>ClínicaMédica",
                      };

                      // Send the email using Gmail API
                      sendMail(mailOptions)
                        .then((result) => console.log("Mail sent!\n\n", result))
                        .catch((error) => console.log(error.message));

                      // Create event dataset
                      const event = {
                        summary:
                          "Dr(a) " + medico_nome + " " + medico_sobrenome,
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
                            apDay - 3, // Bug: Sempre agenda 3 dias depois no calendário. Gabiarra: subtrair 3
                            apHour + 3, // Fuso horário
                            0
                          ),
                          timeZone: "America/Sao_Paulo",
                        },
                        end: {
                          dateTime: new Date(
                            apYear,
                            apMonth - 1,
                            apDay - 3, // Bug: Sempre agenda 3 dias depois no calendário. Gabiarra: subtrair 3
                            apHour + 4, // Fuso horário + 1
                            0
                          ),
                          timeZone: "America/Sao_Paulo",
                        },
                      };

                      // Create the event
                      createCalendarEvent(event);

                      // Send success message
                      return res.json({
                        fulfillmentText:
                          "Agendamento realizado com sucesso para o(a) Dr(a) " +
                          medico_nome +
                          " " +
                          medico_sobrenome +
                          " no dia: " +
                          apDay +
                          "/" +
                          apMonth +
                          "/" +
                          apYear +
                          " às " +
                          apHour +
                          ":" +
                          apMin +
                          ".",
                      });
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
                medicos[i].medico_nome + " " + medicos[i].medico_sobrenome;
              lastName =
                medicos[i].medico_nome + " " + medicos[i].medico_sobrenome;
            }
            if (lastDay != weekdayToString(medicos[i].medico_dia)) {
              list += "\n" + weekdayToString(medicos[i].medico_dia) + ": ";
              lastDay = weekdayToString(medicos[i].medico_dia);
            }
            list += medicos[i].medico_hora + ":00 ";
          }

          // Melhorar exibição (testar pelo Telegram)

          return res.json({
            fulfillmentText:
              "Nesta clínica estão disponíveis os seguintes médicos: \n\n" +
              list,
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

    // Get the sheet data
    return axios
      .get(DOCTORSHEET + "/search?medico_id=" + medico_id)
      .then((response) => {
        const medicos = response.data;

        // Verify if the ID exists
        if (!medicos.length) {
          return res.json({
            fulfillmentText:
              "Desculpe, mas não existe profissional com o ID informado (" +
              medico_id +
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
      });
  }

  /*************************************
  INTENT: profissional - novo cadastro
  *************************************/
  if (intentName == "profissional - novo cadastro") {
    // Get the data
    medico_nome = req.body.queryResult.parameters["medico_nome"];
    medico_sobrenome = req.body.queryResult.parameters["medico_sobrenome"];
    medico_dia = stringToWeekday(req.body.queryResult.parameters["dia"]);
    medico_hora = req.body.queryResult.parameters["hora"];

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
          return axios
            .get(DOCTORSHEET + "?sort_by=medico_id&sort_order=desc&limit=1")
            .then((response) => {
              const lastDoctor = response.data[0];
              if (!lastDoctor) {
                medico_id = 1;
                agenda_id = 1;

                // Set the new doctor
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
                  fulfillmentText:
                    "Cadastro realizado com sucesso! Seu ID é " +
                    medico_id +
                    ".",
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
                        fulfillmentText:
                          "Cadastro realizado com sucesso! Seu ID é " +
                          medico_id +
                          ".",
                      });
                    }
                  });
              }
            });
        }
      });
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
                // Create the doctors dataset to post
                const docDataSheet = [
                  {
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
});

// Listen to the port
const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
