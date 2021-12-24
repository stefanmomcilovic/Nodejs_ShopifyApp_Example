import { Heading, Page, Button } from "@shopify/polaris";

function Index(props){
      async function getProductsWithGraphQL(){
          props.authAxios.post("/api", {
            data: {
              action: "GraphQL"
            }
          }).then((res) => {
            console.log(res);
          })
          .catch((err) => {
            console.log(err);
          });
      }
      
      async function getProductsWithRESTAPI(){
        props.authAxios.post("/api", {
          data: {
            action: "RESTAPI"
          }
        }).then((res) => {
          console.log(res);
        })
        .catch((err) => {
          console.log(err);
        });
      }

      async function test(){
        props.authAxios.post("/test").then((res) => {
          console.log(res);
        })
        .catch((err) => {
          console.log(err);
        });
      }

    return (
      <Page>
        <Heading>Shopify app with Node and React </Heading>
        <Button onClick={test}>TEST</Button>
        <Button onClick={getProductsWithGraphQL}>Get Products With GraphQL</Button>
        <Button onClick={getProductsWithRESTAPI}>Get Products With REST API</Button>
      </Page>
    );
}

export default Index;