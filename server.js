/*=-=-=-=-=-=-=-=-=-=
STATUS:
---------------------
Intent agendamento: 
 - Resolver: não compara nomes com acento ===> string.normalize('NFD').replace(/[\u0300-\u036f]/g, "");
 - Resolver: não diferencia 0:00 de 12:00
 
Intent remove agendamento:
 - Não iniciada
 
Intent lista médicos:
 - Finalizada!

Intent login
 - Finalizada!
 
Intent criar-agenda
 - Finalizada!
  
Intent remover-agenda
 - Finalizada!
=-=-=-=-=-=-=-=-=-=*/

// Dependencies
const express = require("express");
const fs = require("fs");
const bodyParser = require("body-parser");
const axios = require("axios");

// Express instances
const app = express();

// Sheet API adresses
const DOCTORSHEET = "https://sheetdb.io/api/v1/hh94ro8u5yutb";
const APPSHEET = "https://sheetdb.io/api/v1/h17j2313u9pye";

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

              console.log(
                APPSHEET +
                  "/search?consulta_dia=" +
                  apDay +
                  "/" +
                  apMonth +
                  "/" +
                  apYear +
                  "&consulta_hora=" +
                  parseInt(apHour)
              );

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
            list += medicos[i].medico_hora + ":00";
          }

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
    medico_dia = req.body.queryResult.parameters["dia"];
    medico_hora = req.body.queryResult.parameters["hora"];
    
    // Verificar se já não existe
    // Verificar último ID da agenda
    // Verificar último ID de médico
    // Registrar valores!
    
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
            .delete(
              DOCTORSHEET + "/agenda_id/" + registro[0].agenda_id
            )
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

// Functions
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

function stringToWeekday(data) {
  data = data.toLowerCase()
  
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

function splitDate(data) {
  let splittedDate = [3];
  splittedDate[0] = data.split("-")[2].split("T")[0];
  splittedDate[1] = data.split("-")[1];
  splittedDate[2] = data.split("-")[0];

  return splittedDate;
}

function splitHour(data) {
  let splittedHour = [2];
  splittedHour[0] = data.split("T")[1].split("-")[0].split(":")[0];
  splittedHour[1] = data.split("T")[1].split("-")[0].split(":")[1];

  return splittedHour;
}
