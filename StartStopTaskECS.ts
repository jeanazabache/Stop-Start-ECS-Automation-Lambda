import {
    ECSClient,
    ListClustersCommand,
    ListServicesCommand,
    DescribeServicesCommand,
    UpdateServiceCommand,
  } from "@aws-sdk/client-ecs";
  
  const client = new ECSClient({ region: "us-east-1" });
  
  const EXCLUDED_PATTERNS = process.env.EXCLUDED_NAMES
    ? process.env.EXCLUDED_NAMES.split(",").map((v) => v.trim().toLowerCase())
    : [];
  
  export const handler = async (event) => {
    try {
      console.log("🚀 Inicio de ejecución");
  
      const status = event?.status?.toLowerCase();
      if (!["start", "stop"].includes(status)) {
        console.error("❌ El campo 'status' debe ser 'start' o 'stop'");
        return;
      }
  
      const desiredCount = status === "start" ? 1 : 0;
  
      const inputCluster = { nextToken: null, maxResults: 100 };
      let process = true;
  
      while (process) {
        const commandCluster = new ListClustersCommand(inputCluster);
        const responseCluster = await client.send(commandCluster);
  
        if (!responseCluster.nextToken) process = false;
        else inputCluster.nextToken = responseCluster.nextToken;
  
        if (responseCluster.clusterArns?.length > 0) {
          for (const clusterArn of responseCluster.clusterArns) {
            await processService(clusterArn, desiredCount);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error general:", error);
    }
  
    async function processService(clusterArn, desiredCount) {
      const inputService = {
        cluster: clusterArn,
        nextToken: null,
      };
      let processService = true;
  
      while (processService) {
        const commandService = new ListServicesCommand(inputService);
        const responseService = await client.send(commandService);
  
        if (!responseService.nextToken) processService = false;
        else inputService.nextToken = responseService.nextToken;
  
        if (responseService.serviceArns?.length > 0) {
          for (const serviceArn of responseService.serviceArns) {
            await updateService(clusterArn, serviceArn, desiredCount);
          }
        }
      }
    }
  
    async function updateService(clusterArn, serviceArn, desiredCount) {
      const clusterName = clusterArn.split("/")[1];
      const serviceName = serviceArn.split("/")[2];
  
      const clusterNameLower = clusterName.toLowerCase();
      const serviceNameLower = serviceName.toLowerCase();
  
      const shouldExclude = EXCLUDED_PATTERNS.some((pattern) =>
        clusterNameLower.includes(pattern) || serviceNameLower.includes(pattern)
      );
  
      if (shouldExclude) {
        console.log(`🟡 Omitido: Cluster "${clusterName}" o Servicio "${serviceName}"`);
        return;
      }
  
      const describeCmd = new DescribeServicesCommand({
        cluster: clusterArn,
        services: [serviceName],
      });
      const describeResp = await client.send(describeCmd);
      const serviceInfo = describeResp.services?.[0];
  
      if (!serviceInfo) {
        console.log(`⚠️ No se pudo obtener info de ${serviceName}`);
        return;
      }
  
      const currentCount = serviceInfo.desiredCount;
  
      if (currentCount === desiredCount) {
        console.log(`⏭️ Sin cambios: ${serviceName} ya estaba en ${desiredCount}`);
        return;
      }
  
      const updateCmd = new UpdateServiceCommand({
        cluster: clusterArn,
        service: serviceName,
        desiredCount,
      });
      await client.send(updateCmd);
  
      const action = desiredCount === 0 ? "🔴 Detenido" : "🟢 Iniciado";
      console.log(`${action}: ${serviceName} (antes: ${currentCount} → ahora: ${desiredCount})`);
    }
  };
  