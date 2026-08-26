const express = require("express");
// const mysql = require("mssql");
// const sql = require("mysql2");
const config = require("./dbconfig")
const router = express.Router();
const bcrypt = require("bcrypt");

router.get("/userprofile", (req, res) => {
    res.send("userprofile API Working ✅");
});
router.post("/userprofile", async (req, res) => {

    try {

        const {
            userid,
            fullname,
            email,
            status,
            mobileno,
            company,
            branch,
            address
        } = req.body;

        // MySQL Stored Procedure
        await config.promise().query(
            "CALL sp_UpdateUser(?, ?, ?, ?, ?, ?, ?, ?)",
            [
                userid,
                fullname,
                email,
                status,
                mobileno,
                company,
                branch,
                address
            ]
        );

        res.send({
            success: true,
            message: "Data Updated Successfully"
        });

    }
    catch (err) {

        console.log("❌ Error:", err.message);

        res.status(500).send({
            success: false,
            message: err.message
        });

    }

});
router.post("/userpasswordReset", async (req, res) => {

    try {

        const { userid, newPassword } = req.body;

        // Password Hash
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // MySQL Stored Procedure
        await config.promise().query(
            "CALL userpassword_Update(?, ?)",
            [userid, hashedPassword]
        );

        res.send({
            success: true,
            message: "Password Reset Successfully"
        });

    }
    catch (err) {

        console.log("❌ Error:", err.message);

        res.status(500).send({
            success: false,
            message: err.message
        });

    }

});

module.exports = router;