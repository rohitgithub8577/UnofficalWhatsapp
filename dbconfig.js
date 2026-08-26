// THis Connect is MsSql
// const config = {
//     server: "DESKTOP-SDENQMO\\MSSQLSERVER01", 
//     database: "waba",
//     user: "sa",                                 
//     password: "master",                         
//     options: {                                  
//         trustServerCertificate: true,
//         encrypt: false                          
//     },
//     port: 1433                                   
// };

// module.exports = config;


const mysql = require("mysql2");

const connection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "admin",
    database: "dbwhatsapp",
    port: 3306
});

connection.connect((err) => {
    if (err) {
        console.error("❌ MySQL Connection Failed:");
        console.error("Error Code:", err.code);
        console.error("Error Message:", err.message);
        return;
    }

    console.log("✅ MySQL Connected Successfully");
});

module.exports = connection;
