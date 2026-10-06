const sql = require("mssql");
const config = require("./dbconfig");

async function testConnection() {
    try {
        console.log("🔄 Connecting to SQL Server...");
        let pool = await sql.connect(config);
        let resultss =  await pool.request().query('Select * from Users')
        console.log(resultss.recordset);
        
        // Simple query test
        let result = await pool.request().query("SELECT 1 AS test");
        console.log("✅ Query Works!", result.recordset);
        
        sql.close();
    } catch (err) {
        console.log("❌ Connection Failed!");
        console.log("Error:", err.message);
    }
}

testConnection();