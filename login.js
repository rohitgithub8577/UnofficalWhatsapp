const express = require("express");
// const sql = require("mssql");
const config = require("./dbconfig")
const router = express.Router();
const bcrypt=require("bcrypt");
// const mysql = require("mysql2");

router.post("/login", async (req, res) => {
    try {

        const { username, password } = req.body;

        // MySQL SP Call
        const [rows] = await config.promise().query(
            "CALL sp_LoginUser(?)",
            [username]
        );

        // MySQL stored procedure result
        const result = rows[0];

        if (result.length > 0) {

            // Inactive User
            if (result[0].statuscode == -1) {
                return res.send({
                    success: false,
                    message: "You cannot login because your account is inactive"
                });
            }

            const user = result[0];

            // Password Match
            const match = await bcrypt.compare(password, user.password);

            if (match) {

                res.send({
                    success: true,
                    user: user
                });

            } else {

                res.send({
                    success: false,
                    message: "Invalid Username or Password"
                });

            }

        } else {

            res.send({
                success: false,
                message: "Invalid Username or Password"
            });

        }

    }
    catch (err) {

        res.status(500).send({
            success: false,
            message: err.message
        });

    }
});

module.exports = router;








// router.post("/login",async(req,res)=>{
// try{
// const{username,password}=req.body;
// let pool=await sql.connect(config);
// let result=await pool.request()
// .input("username",sql.NVarChar(50),username)
// .execute("sp_LoginUser");
// if(result.recordset.length>0){
// if(result.recordset[0].statuscode==-1){
// return res.send({
// success:false,
// message:"You cannot login because your account is inactive"
// });
// }
// const user=result.recordset[0];
// const match=await bcrypt.compare(password,user.password);
// if(match){
// res.send({
// success:true,
// user:user
// });
// }
// else{
// res.send({
// success:false,
// message:"Invalid Username or Password"
// });
// }
// }
// else{
// res.send({
// success:false,
// message:"Invalid Username or Password"
// });
// }
// }
// catch(err){
// res.status(500).send({
// success:false,
// message:err.message
// });
// }
// });
// module.exports = router;