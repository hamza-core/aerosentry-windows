using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122103118_AddWalls : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Walls",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PropertyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                CameraId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                FrameWidth = table.Column<int>(type: "int", nullable: false),
                FrameHeight = table.Column<int>(type: "int", nullable: false),
                TopPointsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                BottomPointsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                LaserGridId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                CameraGridRow = table.Column<int>(type: "int", nullable: true),
                CameraGridCol = table.Column<int>(type: "int", nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Walls", x => x.Id);
                table.ForeignKey(
                    name: "FK_Walls_Cameras_CameraId",
                    column: x => x.CameraId,
                    principalTable: "Cameras",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_Walls_LaserGrids_LaserGridId",
                    column: x => x.LaserGridId,
                    principalTable: "LaserGrids",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_Walls_Properties_PropertyId",
                    column: x => x.PropertyId,
                    principalTable: "Properties",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Walls_CameraId",
            table: "Walls",
            column: "CameraId");

        migrationBuilder.CreateIndex(
            name: "IX_Walls_LaserGridId",
            table: "Walls",
            column: "LaserGridId");

        migrationBuilder.CreateIndex(
            name: "IX_Walls_PropertyId_Name",
            table: "Walls",
            columns: new[] { "PropertyId", "Name" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "Walls");
    }
}
