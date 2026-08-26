const express = require("express");
// const sql = require("mssql");
const config = require("./dbconfig");
const { stat } = require("fs-extra");
const router = express.Router();

router.post("/createSessionForUser", async (req, res) => {
    try {
        const label = req.body.label;
        const userid = req.body.userid;
        const sessionid = req.body.sessionid;
        const createdby = req.body.createdby;
          const currentdate = req.body.currentdate;
         const [rows] = await config.promise().query(
            "CALL tblusersession_insert(?, ?, ?, ?, ?)",
            [label, userid, sessionid, createdby, currentdate]
        );

console.log(JSON.stringify(rows, null, 2));

        res.json({
            success: true,
            message: "Session Created Successfully"
        });
      
    } catch (err) {
         console.log("❌ Error:", err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});


module.exports = router;