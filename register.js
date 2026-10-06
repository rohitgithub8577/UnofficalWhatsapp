const express = require("express");
// const sql = require("mssql");
const config = require("./dbconfig");
const { stat } = require("fs-extra");
const router = express.Router();
const bcrypt = require("bcrypt");


router.post("/insertdataregister", async (req, res) => {

    try {

        const id = req.body.id;
        const fullname = req.body.fullname;
        const email = req.body.email;
        const role = req.body.role;
        const status = req.body.status;
        const mobileno = req.body.mobileno;
        const company = req.body.company;
        const branch = req.body.branch;
        const username = req.body.username;
        const password = req.body.password;
        const address = req.body.address;
        const logo = req.body.logo;

        // Password Hash
        const hashedPassword = password ? await bcrypt.hash(password, 10) : "";

        // UPDATE USER
        if (id != "" && id != null) {

            await config.promise().query(
                "CALL sp_UpdateUser(?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    id,
                    fullname || "",
                    email || "",
                    status || "",
                    mobileno || "",
                    company || "",
                    branch || "",
                    address || ""
                ]
            );

            res.send({
                success: true,
                message: "User Updated Successfully"
            });

        }
        else {

            // INSERT USER
            await config.promise().query(
                "CALL sp_InsertUser(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    fullname || "",
                    email || "",
                    role || "",
                    status || "",
                    mobileno || "",
                    company || "",
                    branch || "",
                    username || "",
                    hashedPassword || "",
                    address || "",
                    logo || ""
                ]
            );

            res.send({
                success: true,
                message: "User Registered Successfully"
            });

        }

    }
    catch (err) {

        console.log("❌ Error:", err.message);

        res.status(500).send({
            success: false,
            message: err.message
        });

    }

});
// GET REGISTER DATA API
router.get("/getregisterdata", async (req, res) => {
    try {
        const username = req.query.username || "";
        const [rows] = await config.promise().query(
            "CALL getregisterdata(?)",
            [username]
        );
        res.json({
            success: true,
            data: rows[0]
        });
    }
    catch (error) {
        console.log("❌ Error:", error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});

router.get("/deleteregisterdata", async (req, res) => {

    try {

        const id = req.query.id;

        // MySQL Stored Procedure
        await config.promise().query(
            "CALL sp_deleteregisterdata(?)",
            [id]
        );

        res.status(200).json({
            status: true,
            message: "Data Deleted Successfully"
        });

    }
    catch (error) {

        console.log("❌ Error:", error.message);

        res.status(500).json({
            status: false,
            message: error.message
        });

    }

});

router.get("/getregisterdatabyid", async (req, res) => {

    try {

        const id = req.query.id;

        // MySQL Stored Procedure
        const [rows] = await config.promise().query(
            "CALL sp_getregisterdatabyid(?)",
            [id]
        );

        res.json({
            status: true,
            data: rows[0]
        });

    }
    catch (error) {

        console.log("❌ Error:", error.message);

        res.status(500).json({
            status: false,
            message: error.message
        });

    }

});

module.exports = router;