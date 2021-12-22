const { Session } = require("@shopify/shopify-api/dist/auth/session");
const { Shopify_custom_session_storage } = require("./../models/sequelizeModels");
const { Op } = require("sequelize");

async function storeCallback(session){
    console.log('storeCallback session: ', session);

    try {
        let sessionData = await Shopify_custom_session_storage.upsert({
            sessionId: session.id,
            shop: `${session.shop}`,
            state: `${session.state}`,
            scope: `${ '' +session.scope + ''}`,
            expires: `${ '' +session.expires + ''}`,
            isOnline: `${session.isOnline}`,
            accessToken: `${session.accessToken}`,
            onlineAccessInfo: `${ '' +JSON.stringify(session.onlineAccessInfo) + ''}`
        });

        if(sessionData){
            return true;
        }else{
            return false;
        }
    }catch(err){
        if(err) throw err;
        return false;
    }
}

async function loadCallback(id){
    try {
        console.log('loadCallback Id: ', id);
        let session = new Session(id);
        console.log('session', session);

        

        let result = await Shopify_custom_session_storage.findAll({
            limit: 1,
            where: {
                [Op.or]: [
                    { sessionId: id },
                    { shop: id }
                ]
            },
            raw: true
        });
        if(result.length > 0){
            console.log("---------------- RESULT ------------------");
            console.log(result);
            console.log("---------------- /RESULT ------------------");
            session.shop = result[0].shop;
            session.state = result[0].state;
            session.scope = result[0].scope;
            let today = new Date();
            let tomorrow = new Date(today.getTime() + (1000 * 60 * 60 * 24));
            session.expires = result[0].expires ? tomorrow : undefined;
            session.isOnline = result[0].isOnline == "true" ? true : false;
            session.accessToken = result[0].accessToken;
            session.onlineAccessInfo = result[0].onlineAccessInfo;
            console.log("---------------- SESSION ------------------");
                console.log(session);
            console.log("---------------- /SESSION ------------------");
            return session;
        }else{
            return undefined;
        }
        
    } catch(err) {
        if(err) throw err;
        return undefined;
    }
  
}

async function deleteCallback(id){
    console.log('deleteCallback ID: ', id);Session
    await Shopify_custom_session_storage.destroy({
        limit: 1,
        where: {
            sessionId: id
        }
    })
    .then(result => {
        return true;
    })
    .catch(err => {
        if(err) throw err;
        return false;
    });
}

module.exports = {
    storeCallback,
    loadCallback,
    deleteCallback
};